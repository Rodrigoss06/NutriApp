import {
  domainError,
  err,
  isErr,
  ok,
  type AuditEntry,
  type DomainEvent,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AssessmentApi } from '../../assessment/index.js';
import type { ClinicalApi, LatestScreening } from '../../clinical/index.js';
import type { ExerciseApi } from '../../exercise/index.js';
import { AthleteProfileCommands } from './commands/athlete-profile.commands.js';
import type { AthleteProfileRecord, AthleteProfileStore } from './ports/training.ports.js';
import { TrainingSafetyQueries } from './queries/training-safety.queries.js';
import { TrainingSafety } from './training-safety.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const USER = '0192f0a0-0000-7000-8000-0000000000e1' as UserId;
const context: SecurityContext = {
  organizationId: ORG,
  userId: USER,
  role: 'PROFESSIONAL',
  patientId: null,
  memberId: '0192f0a0-0000-7000-8000-0000000000a1' as SecurityContext['memberId'],
};
const INPUT = {
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 4,
  minutesPerSession: null,
  equipmentCodes: ['FULL_GYM'],
  startDate: null,
  macrocycleWeeks: 12,
  medicalClearance: 'CLEARED',
  alarmSymptoms: false,
  injuriesNote: null,
  restrictionsNote: null,
  baselineWeightKg: null,
  baselineRestingHrBpm: null,
  baselineHrvMs: null,
  sleepTargetHours: 8,
  testTargets: {},
  notes: null,
} as const;
const GREEN: LatestScreening = {
  id: '0192f0a0-0000-7000-8000-0000000000d1',
  status: 'GREEN',
  reviewDecision: null,
  answeredAt: new Date('2026-10-20T14:00:00.000Z'),
};

class MemoryProfiles implements AthleteProfileStore {
  readonly rows: AthleteProfileRecord[] = [];
  latest(patientId: string) {
    const own = this.rows.filter((row) => row.patientId === patientId);
    return Promise.resolve(own.at(-1) ?? null);
  }
  insert(profile: AthleteProfileRecord) {
    this.rows.push(profile);
    return Promise.resolve();
  }
}

let profiles: MemoryProfiles;
let events: DomainEvent[];
let audits: AuditEntry[];
let visible: boolean;
let locks: string[];
let writable: ReturnType<typeof ok<unknown>> | ReturnType<typeof err>;
let screening: LatestScreening | null;
let movement: { evaluated: boolean; statuses: string[] };

const uow = {
  run: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
  query: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
};
const clock = { now: () => new Date('2026-10-20T15:00:00.000Z') };
const ids = { newId: () => '0192f0a0-0000-7000-8000-0000000000f1' as never };
const outbox = {
  append: (appended: readonly DomainEvent[]) => {
    events.push(...appended);
    return Promise.resolve();
  },
};
const audit = {
  record: (_c: SecurityContext, entry: AuditEntry) => {
    audits.push(entry);
    return Promise.resolve();
  },
};
const clinical = () =>
  ({
    ensureRecordWritable: () => Promise.resolve(writable),
    latestScreening: () => Promise.resolve(screening),
    lockPatient: (patientId: string) => {
      locks.push(patientId);
      return Promise.resolve();
    },
    patientRef: () => Promise.resolve(visible ? { id: PATIENT } : null),
  }) as unknown as ClinicalApi;
const assessment = () =>
  ({
    movementKeys: () => Promise.resolve(movement),
    physicalTestCodes: () => Promise.resolve(['WALK_6MIN']),
  }) as unknown as AssessmentApi;
const exercises = {
  catalog: () => Promise.resolve({ equipment: [{ code: 'FULL_GYM', name: 'Gimnasio completo' }] }),
} as unknown as ExerciseApi;

const commands = () =>
  new AthleteProfileCommands(
    uow,
    clock,
    ids,
    outbox,
    profiles,
    clinical(),
    assessment(),
    exercises,
  );
const safety = () => new TrainingSafety(profiles, clinical(), assessment());
const queries = () => new TrainingSafetyQueries(uow, audit, profiles, clinical(), safety());

const saveProfile = (changes: object = {}, expectedRevision = 0) =>
  commands().save(context, PATIENT, expectedRevision, { ...INPUT, ...changes });

beforeEach(() => {
  profiles = new MemoryProfiles();
  events = [];
  audits = [];
  visible = true;
  locks = [];
  writable = ok({ id: PATIENT });
  screening = null;
  movement = { evaluated: false, statuses: [] };
});

describe('07 §2 · guardar el perfil de entrenamiento', () => {
  it('cada guardado es una revisión nueva, con su evento y bajo el bloqueo del paciente', async () => {
    expect(await saveProfile()).toEqual(ok({ revision: 1 }));
    expect(await saveProfile({ daysPerWeek: 5 }, 1)).toEqual(ok({ revision: 2 }));

    expect(profiles.rows.map((row) => row.revision)).toEqual([1, 2]);
    expect(profiles.rows[1]).toMatchObject({
      daysPerWeek: 5,
      organizationId: ORG,
      recordedBy: USER,
      patientId: PATIENT,
    });
    expect(events.map((event) => event.type)).toEqual([
      'training.profile.revised',
      'training.profile.revised',
    ]);
    expect(events[0]?.payload).toEqual({ patientId: PATIENT, revision: 1 });
    expect(locks).toEqual([PATIENT, PATIENT]);
  });

  it('sobre una revisión vieja no se guarda: NC-TRA-001', async () => {
    await saveProfile();

    const stale = await saveProfile({ daysPerWeek: 5 }, 0);

    expect(isErr(stale) && stale.error.code).toBe('NC-TRA-001');
    expect(profiles.rows).toHaveLength(1);
  });

  it('el equipamiento y los objetivos salen de sus catálogos: NC-TRA-002', async () => {
    const invalid = await saveProfile({ equipmentCodes: ['TRINEO'] });

    expect(isErr(invalid) && invalid.error.code).toBe('NC-TRA-002');
    expect(profiles.rows).toEqual([]);
  });

  it('RN-A05 · RN-B01: lo que clinical niega no se guarda', async () => {
    writable = err(domainError({ code: 'NC-CLI-020', message: 'Sin acceso de escritura.' }));

    const denied = await saveProfile();

    expect(isErr(denied) && denied.error.code).toBe('NC-CLI-020');
    expect(events).toEqual([]);
  });

  it('sin organización o sin usuario, no hay quién lo guarde', async () => {
    await expect(commands().save({ ...context, userId: null }, PATIENT, 0, INPUT)).rejects.toThrow(
      /quién/,
    );
  });
});

describe('RN-F15 · las tres llaves de un paciente', () => {
  it('sin perfil, el alta cuenta como pendiente', async () => {
    expect(await safety().of(PATIENT)).toMatchObject({
      status: 'BLOCKED_CLEARANCE',
      blocked: true,
      medicalClearance: null,
      alarmSymptoms: false,
      screening: null,
    });
  });

  it('con alta y sin cribado sigue bloqueado', async () => {
    await saveProfile();

    expect(await safety().of(PATIENT)).toMatchObject({
      status: 'BLOCKED_SCREENING',
      medicalClearance: 'CLEARED',
    });
  });

  it('con el cribado en verde se abre, aunque falte la postura (ADR-070)', async () => {
    await saveProfile();
    screening = GREEN;

    expect(await safety().of(PATIENT)).toMatchObject({
      status: 'PENDING_APPROVAL',
      blocked: false,
      movement: { evaluated: false, painTests: 0 },
    });
  });

  it('el dolor cuenta sus pruebas y bloquea; lo demás de la postura no', async () => {
    await saveProfile();
    screening = GREEN;
    movement = { evaluated: true, statuses: ['FIT', 'REFER', 'MODIFY', 'REFER', 'CAUTION'] };
    expect(await safety().of(PATIENT)).toMatchObject({
      status: 'BLOCKED_PAIN',
      movement: { evaluated: true, painTests: 2 },
    });

    movement = { evaluated: true, statuses: ['FIT', 'MODIFY', 'CAUTION', 'PENDING'] };
    expect((await safety().of(PATIENT)).status).toBe('PENDING_APPROVAL');
  });

  it('los síntomas de alarma bloquean como el dolor', async () => {
    await saveProfile({ alarmSymptoms: true });
    screening = GREEN;

    expect(await safety().of(PATIENT)).toMatchObject({
      status: 'BLOCKED_PAIN',
      alarmSymptoms: true,
    });
  });

  it('derivar sigue bloqueado; iniciar o limitar, no', async () => {
    await saveProfile();
    screening = { ...GREEN, status: 'RED', reviewDecision: 'REFER' };
    expect((await safety().of(PATIENT)).status).toBe('BLOCKED_REFERRED');

    screening = { ...GREEN, status: 'AMBER', reviewDecision: 'LIMIT' };
    expect((await safety().of(PATIENT)).status).toBe('PENDING_APPROVAL');

    screening = { ...GREEN, status: 'RED', reviewDecision: null };
    expect((await safety().of(PATIENT)).status).toBe('BLOCKED_SCREENING');
  });
});

describe('RN-B03 · leer el perfil y las llaves', () => {
  it('sin ver al paciente no hay nada, ni READ', async () => {
    visible = false;

    expect(await queries().profile(context, PATIENT)).toBeUndefined();
    expect(await queries().safetyOf(context, PATIENT)).toBeUndefined();
    expect(audits).toEqual([]);
  });

  it('sin perfil, null; cada lectura deja su READ', async () => {
    expect(await queries().profile(context, PATIENT)).toBeNull();
    await saveProfile();
    expect((await queries().profile(context, PATIENT))?.revision).toBe(1);
    expect((await queries().safetyOf(context, PATIENT))?.status).toBe('BLOCKED_SCREENING');

    expect(audits).toHaveLength(3);
    expect(audits[0]).toMatchObject({
      action: 'READ',
      resourceType: 'training.athlete_profile',
      resourceId: PATIENT,
      patientId: PATIENT,
    });
  });
});
