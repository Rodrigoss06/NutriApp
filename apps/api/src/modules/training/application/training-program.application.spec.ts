import {
  err,
  isErr,
  ok,
  type AuditEntry,
  type DomainEvent,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { MOVEMENT_PATTERNS, TRAINING_LEVELS } from '@nutricoach/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import phasesSeed from '../../../../../../seeds/training/periodization-v3.json' with { type: 'json' };
import type { ClinicalApi, TimelineEntry } from '../../clinical/index.js';
import type { ExerciseApi, ExerciseRecord } from '../../exercise/index.js';
import { copyMesocycles, weeksOf, type Mesocycle, type ProgramSession } from '../domain/program.js';
import { ProgramCommands } from './commands/program.commands.js';
import type {
  BlockApproval,
  ProgramHeaderChanges,
  ProgramPublication,
  ProgramRecord,
  ProgramStore,
  StoredPhase,
} from './ports/program.ports.js';
import type { AthleteProfileRecord, AthleteProfileStore } from './ports/training.ports.js';
import type { ProgramSnapshot } from './program-document.js';
import { ProgramQueries } from './queries/program.queries.js';
import { TrainingApi } from './training-api.js';
import type { TrainingSafety } from './training-safety.js';
import { TrainingTimelineSource } from './training-timeline.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const USER = '0192f0a0-0000-7000-8000-0000000000e1' as UserId;
const MEMBER = '0192f0a0-0000-7000-8000-0000000000a1';
const context: SecurityContext = {
  organizationId: ORG,
  userId: USER,
  role: 'PROFESSIONAL',
  patientId: null,
  memberId: MEMBER as SecurityContext['memberId'],
};
const SET = {
  setType: 'WORKING',
  repsMin: 8,
  repsMax: 12,
  loadKind: 'RIR',
  loadValue: 2,
  restSeconds: 90,
  tempo: null,
  durationSeconds: null,
  distanceM: null,
  met: null,
} as const;

/** Lo que la base hace por el almacén: borrador con versión, una sola publicada y un solo borrador por rutina. */
class MemoryPrograms implements ProgramStore {
  readonly rows = new Map<string, ProgramRecord>();
  snapshots = new Map<string, ProgramSnapshot>();
  phaseRows: readonly StoredPhase[] = phasesSeed.phases.map((phase) => ({
    ...phase,
    validFrom: phasesSeed.validFrom,
    own: false,
  })) as readonly StoredPhase[];

  #set(id: string, changes: Partial<ProgramRecord>) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...changes });
  }
  insert(program: ProgramRecord) {
    this.rows.set(program.id, program);
    return Promise.resolve();
  }
  find(id: string) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  listByPatient(patientId: string) {
    return Promise.resolve([...this.rows.values()].filter((row) => row.patientId === patientId));
  }
  lineage(lineageId: string) {
    const rows = [...this.rows.values()].filter((row) => row.lineageId === lineageId);
    return Promise.resolve({
      lastVersionNo: Math.max(0, ...rows.map((row) => row.versionNo)),
      draftId: rows.find((row) => row.status === 'DRAFT')?.id ?? null,
    });
  }
  formulaOf(patientId: string, exceptProgramId: string | null) {
    const row = [...this.rows.values()].find(
      (r) => r.patientId === patientId && r.id !== exceptProgramId,
    );
    return Promise.resolve(row?.oneRmFormula ?? null);
  }
  touch(id: string, version: number, _now: Date, changes: ProgramHeaderChanges = {}) {
    const row = this.rows.get(id);
    if (row?.version !== version || row.status !== 'DRAFT') return Promise.resolve(false);
    this.#set(id, { ...changes, version: version + 1 });
    return Promise.resolve(true);
  }
  #mapWeek(
    weekId: string,
    change: (sessions: readonly ProgramSession[]) => readonly ProgramSession[],
  ) {
    for (const row of this.rows.values()) {
      this.#set(row.id, {
        mesocycles: row.mesocycles.map((mesocycle) => ({
          ...mesocycle,
          weeks: mesocycle.weeks.map((week) =>
            week.id === weekId ? { ...week, sessions: change(week.sessions) } : week,
          ),
        })),
      });
    }
  }
  saveWeek(_org: string, weekId: string, _phase: object, sessions: readonly ProgramSession[]) {
    this.#mapWeek(weekId, () => sessions);
    return Promise.resolve();
  }
  addMesocycle(_org: string, programId: string, mesocycle: Mesocycle) {
    const row = this.rows.get(programId);
    this.#set(programId, { mesocycles: [...(row?.mesocycles ?? []), mesocycle] });
    return Promise.resolve();
  }
  removeMesocycle(mesocycleId: string) {
    for (const row of this.rows.values()) {
      this.#set(row.id, { mesocycles: row.mesocycles.filter((m) => m.id !== mesocycleId) });
    }
    return Promise.resolve();
  }
  renumbered: readonly Mesocycle[] = [];
  renumber(mesocycles: readonly Mesocycle[]) {
    this.renumbered = mesocycles;
    return Promise.resolve();
  }
  approveBlock(programId: string, day: number, order: number, approval: BlockApproval) {
    let touched = 0;
    const row = this.rows.get(programId);
    this.#set(programId, {
      mesocycles: (row?.mesocycles ?? []).map((mesocycle) => ({
        ...mesocycle,
        weeks: mesocycle.weeks.map((week) => ({
          ...week,
          sessions: week.sessions.map((session) =>
            session.position !== day
              ? session
              : {
                  ...session,
                  exercises: session.exercises.map((exercise) => {
                    if (exercise.position !== order) return exercise;
                    touched += 1;
                    return {
                      ...exercise,
                      exerciseId: approval.exerciseId ?? exercise.exerciseId,
                      substitutionNote: approval.note,
                      approvedBy: approval.approvedBy,
                      approvedAt: approval.approvedAt,
                    };
                  }),
                },
          ),
        })),
      })),
    });
    return Promise.resolve(touched);
  }
  publish(id: string, version: number, publication: ProgramPublication) {
    const row = this.rows.get(id);
    if (row?.version !== version) return Promise.resolve(false);
    this.#set(id, {
      status: 'PUBLISHED',
      publishedAt: publication.publishedAt,
      startDate: publication.startDate,
      endDate: publication.endDate,
      version: version + 1,
    });
    this.snapshots.set(id, publication.snapshot);
    return Promise.resolve(true);
  }
  supersedePublished(patientId: string) {
    const row = [...this.rows.values()].find(
      (r) => r.patientId === patientId && r.status === 'PUBLISHED',
    );
    if (!row) return Promise.resolve(null);
    this.#set(row.id, { status: 'SUPERSEDED' });
    return Promise.resolve(row.id);
  }
  snapshot(id: string) {
    return Promise.resolve(this.snapshots.get(id) ?? null);
  }
  status(id: string) {
    return Promise.resolve(this.rows.get(id)?.status ?? null);
  }
  timeline(): Promise<readonly TimelineEntry[]> {
    return Promise.resolve([]);
  }
  phases() {
    return Promise.resolve(this.phaseRows);
  }
}

const exerciseRecord = (id: string) =>
  ({
    id,
    name: `Ejercicio ${id}`,
    pattern: 'SQUAT',
    primaryMuscles: [{ code: 'QUADRICEPS', name: 'Cuádriceps' }],
    secondaryMuscles: [],
    caution: null,
    alternative: null,
    easierVariant: null,
    harderVariant: null,
    mediaUrl: null,
    instructions: null,
  }) as unknown as ExerciseRecord;

const CHOICES = MOVEMENT_PATTERNS.flatMap((pattern) =>
  TRAINING_LEVELS.map((level) => ({
    pattern,
    level,
    exercise: { id: `${pattern}-${level}`, name: pattern },
    own: false,
    provisional: false,
  })),
);

const PROFILE = {
  id: 'perfil',
  patientId: PATIENT,
  revision: 1,
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 2,
  minutesPerSession: null,
  equipmentCodes: [],
  startDate: '2026-11-02',
  macrocycleWeeks: 8,
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
  recordedBy: USER,
  recordedAt: new Date('2026-10-31T00:00:00Z'),
} as const satisfies AthleteProfileRecord;

let programs: MemoryPrograms;
let events: DomainEvent[];
let audits: AuditEntry[];
let blocked: boolean;
let profile: AthleteProfileRecord | null;
let writable: boolean;
let visible: boolean;
let known: string[];
let nextId: number;

const uow = {
  run: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
  query: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
};
const clock = { now: () => new Date('2026-10-31T15:00:00.000Z') };
const ids = {
  newId: () => {
    nextId += 1;
    return `id-${String(nextId)}` as never;
  },
};
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
const DENIED = { code: 'NC-CLI-013', message: 'Sin escritura.' };
const clinical = () =>
  ({
    ensureRecordWritable: () =>
      Promise.resolve(writable ? ok({ timezone: 'America/Lima' }) : err(DENIED)),
    patientRef: () => Promise.resolve(visible ? { id: PATIENT } : null),
  }) as unknown as ClinicalApi;
const exercises = () =>
  ({
    patternChoices: () => Promise.resolve(CHOICES),
    exercisesById: (wanted: readonly string[]) =>
      Promise.resolve(wanted.filter((id) => known.includes(id)).map(exerciseRecord)),
  }) as unknown as ExerciseApi;
const profiles = (): AthleteProfileStore => ({
  latest: () => Promise.resolve(profile),
  insert: () => Promise.resolve(),
});
const safety = () =>
  ({
    of: () =>
      Promise.resolve({
        status: blocked ? 'BLOCKED_PAIN' : 'PENDING_APPROVAL',
        blocked,
      }),
  }) as unknown as TrainingSafety;

const commands = () =>
  new ProgramCommands(
    uow,
    clock,
    ids,
    outbox,
    programs,
    profiles(),
    safety(),
    clinical(),
    exercises(),
  );
const queries = () => new ProgramQueries(uow, audit, programs, safety(), clinical(), exercises());

const value = <T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T => {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};
const codeOf = (result: { ok: boolean; error?: { code: string } }) => result.error?.code ?? null;
const types = () => events.map((event) => event.type);
const program = (id: string): ProgramRecord => {
  const row = programs.rows.get(id);
  if (!row) throw new Error(id);
  return row;
};
const manual = async () =>
  value(
    await commands().create(context, PATIENT, {
      name: 'Rutina',
      goal: null,
      startDate: null,
      oneRmFormula: null,
    }),
  ).id;
const sessionInput = (exerciseId = 'sentadilla', set: object = SET) => ({
  name: 'Sesión 1',
  dayOfWeek: null,
  notes: null,
  exercises: [
    { id: null, exerciseId, supersetGroup: null, notes: null, sets: [set as typeof SET] },
  ],
});
const withWeek = async (weeks = 1) => {
  const id = await manual();
  value(await commands().addMesocycle(context, id, 0, { name: 'Base', focus: null, weeks }));
  return id;
};
const weekIds = (id: string) => weeksOf(program(id).mesocycles).map((week) => week.id);

beforeEach(() => {
  programs = new MemoryPrograms();
  events = [];
  audits = [];
  blocked = false;
  profile = PROFILE;
  writable = true;
  visible = true;
  known = ['sentadilla', 'remo', ...CHOICES.map((choice) => choice.exercise.id)];
  nextId = 0;
});

describe('RF-26 · crear', () => {
  it('nace en borrador, versión 1, con la fórmula por defecto y su evento', async () => {
    const id = await manual();

    expect(program(id)).toMatchObject({
      status: 'DRAFT',
      versionNo: 1,
      origin: 'MANUAL',
      oneRmFormula: 'ONERM_EPLEY1985',
      organizationId: ORG,
      createdBy: USER,
      version: 0,
    });
    expect(types()).toEqual(['training.program.created']);
  });

  it('RN-F04: toma la fórmula del paciente, y no acepta otra', async () => {
    const first = value(
      await commands().create(context, PATIENT, {
        name: 'A',
        goal: null,
        startDate: null,
        oneRmFormula: 'ONERM_BRZYCKI1993',
      }),
    ).id;
    expect(program(first).oneRmFormula).toBe('ONERM_BRZYCKI1993');
    expect(program(await manual()).oneRmFormula).toBe('ONERM_BRZYCKI1993');

    const other = await commands().create(context, PATIENT, {
      name: 'B',
      goal: null,
      startDate: null,
      oneRmFormula: 'ONERM_EPLEY1985',
    });
    expect(codeOf(other)).toBe('NC-TRA-016');
  });

  it('sin organización no hay caso de uso; sin escritura, tampoco', async () => {
    const input = { name: 'A', goal: null, startDate: null, oneRmFormula: null };
    expect(() => commands().create({ ...context, organizationId: null }, PATIENT, input)).toThrow(
      /organización/,
    );
    writable = false;
    expect(codeOf(await commands().create(context, PATIENT, input))).toBe('NC-CLI-013');
  });
});

describe('RN-F14 · RN-F15 · proponer', () => {
  it('sin perfil o con una llave cerrada no hay propuesta', async () => {
    profile = null;
    expect(codeOf(await commands().propose(context, PATIENT, { name: null }))).toBe('NC-TRA-007');

    profile = PROFILE;
    blocked = true;
    const closed = await commands().propose(context, PATIENT, { name: null });
    expect(isErr(closed) && closed.error).toMatchObject({
      code: 'NC-TRA-006',
      details: { status: 'BLOCKED_PAIN' },
    });
    expect(programs.rows.size).toBe(0);

    writable = false;
    blocked = false;
    expect(codeOf(await commands().propose(context, PATIENT, { name: null }))).toBe('NC-CLI-013');
  });

  it('sale del perfil: guarda lo que usó y empieza cuando dice el perfil', async () => {
    const id = value(await commands().propose(context, PATIENT, { name: null })).id;

    expect(program(id)).toMatchObject({
      origin: 'PROPOSAL',
      name: 'Macrociclo de hipertrofia',
      objective: 'HYPERTROPHY',
      level: 'BEGINNER',
      daysPerWeek: 2,
      split: 'FULL_BODY',
      macrocycleWeeks: 8,
      periodizationValidFrom: phasesSeed.validFrom,
      athleteProfileId: 'perfil',
      startDate: '2026-11-02',
    });
    expect(weeksOf(program(id).mesocycles)).toHaveLength(8);
  });

  it('con nombre propio, lo usa; con la tabla a medias, no propone', async () => {
    const named = value(await commands().propose(context, PATIENT, { name: 'Mi macrociclo' })).id;
    expect(program(named).name).toBe('Mi macrociclo');

    programs.phaseRows = programs.phaseRows.filter((phase) => phase.weekNo !== 2);
    expect(codeOf(await commands().propose(context, PATIENT, { name: null }))).toBe('NC-TRA-019');
  });

  it('aprueba un bloque en todas las semanas, con quién y cuándo', async () => {
    const id = value(await commands().propose(context, PATIENT, { name: null })).id;

    value(
      await commands().approveBlock(context, id, 0, {
        day: 1,
        order: 1,
        exerciseId: 'remo',
        note: 'Rodilla',
      }),
    );

    for (const week of weeksOf(program(id).mesocycles)) {
      expect(week.sessions[0]?.exercises[0]).toMatchObject({
        exerciseId: 'remo',
        suggestedExerciseId: 'SQUAT-BEGINNER',
        substitutionNote: 'Rodilla',
        approvedBy: MEMBER,
      });
    }
    expect(program(id).version).toBe(1);
  });

  it('un bloque que no existe, otro ejercicio desconocido o un programa a mano no se aprueban', async () => {
    const id = value(await commands().propose(context, PATIENT, { name: null })).id;
    const block = { day: 1, order: 1, exerciseId: null, note: null };

    expect(codeOf(await commands().approveBlock(context, id, 0, { ...block, day: 9 }))).toBe(
      'NC-TRA-015',
    );
    expect(
      codeOf(
        await commands().approveBlock(context, id, 1, { ...block, exerciseId: 'desconocido' }),
      ),
    ).toBe('NC-TRA-017');
    expect(codeOf(await commands().approveBlock(context, id, 9, block))).toBe('NC-TRA-005');
    const realTouch = programs.touch.bind(programs);
    programs.touch = () => Promise.resolve(false);
    expect(codeOf(await commands().approveBlock(context, id, 1, block))).toBe('NC-TRA-005');
    programs.touch = realTouch;
    expect(codeOf(await commands().approveBlock(context, await manual(), 0, block))).toBe(
      'NC-TRA-014',
    );
    await expect(
      commands().approveBlock({ ...context, memberId: null }, id, 1, block),
    ).rejects.toThrow(/miembro/);
  });
});

describe('RF-26 · editar el borrador', () => {
  it('cambia el encabezado; RN-F04: la fórmula, solo si es su único programa', async () => {
    const id = await manual();
    value(
      await commands().update(context, id, 0, { name: 'Otra', oneRmFormula: 'ONERM_BRZYCKI1993' }),
    );
    expect(program(id)).toMatchObject({ name: 'Otra', oneRmFormula: 'ONERM_BRZYCKI1993' });
    expect(types()).toContain('training.program.updated');

    const second = await manual();
    expect(
      codeOf(await commands().update(context, second, 0, { oneRmFormula: 'ONERM_EPLEY1985' })),
    ).toBe('NC-TRA-016');
    expect(codeOf(await commands().update(context, second, 9, { name: 'x' }))).toBe('NC-TRA-005');
    expect(codeOf(await commands().update(context, 'no-existe', 0, { name: 'x' }))).toBe(
      'NC-TRA-003',
    );
    programs.touch = () => Promise.resolve(false);
    expect(codeOf(await commands().update(context, second, 0, { name: 'x' }))).toBe('NC-TRA-005');
  });

  it('agrega mesociclos con semanas contiguas y quita, volviendo a numerar', async () => {
    const id = await withWeek(2);
    value(
      await commands().addMesocycle(context, id, 1, { name: 'Otro', focus: 'Fuerza', weeks: 3 }),
    );

    expect(weeksOf(program(id).mesocycles).map((week) => week.weekNo)).toEqual([1, 2, 3, 4, 5]);
    expect(program(id).mesocycles.map((m) => m.position)).toEqual([1, 2]);

    const first = program(id).mesocycles[0]?.id ?? '';
    value(await commands().removeMesocycle(context, id, 2, first));
    expect(programs.renumbered.map((m) => m.name)).toEqual(['Otro']);
    expect(codeOf(await commands().removeMesocycle(context, id, 3, first))).toBe('NC-TRA-011');
  });

  it('la propuesta no agrega ni quita mesociclos', async () => {
    const id = value(await commands().propose(context, PATIENT, { name: null })).id;
    const mesocycle = program(id).mesocycles[0]?.id ?? '';

    expect(
      codeOf(await commands().addMesocycle(context, id, 0, { name: 'x', focus: null, weeks: 1 })),
    ).toBe('NC-TRA-013');
    expect(codeOf(await commands().removeMesocycle(context, id, 0, mesocycle))).toBe('NC-TRA-013');
  });

  it('si otro escribió entre la lectura y el guardado, gana el primero', async () => {
    const id = await withWeek();
    const [weekId] = weekIds(id);
    value(
      await commands().saveWeek(context, id, 1, weekId ?? '', {
        phase: {},
        sessions: [sessionInput()],
      }),
    );
    programs.touch = () => Promise.resolve(false);
    const mesocycle = program(id).mesocycles[0]?.id ?? '';

    expect(
      codeOf(await commands().addMesocycle(context, id, 2, { name: 'x', focus: null, weeks: 1 })),
    ).toBe('NC-TRA-005');
    expect(codeOf(await commands().removeMesocycle(context, id, 2, mesocycle))).toBe('NC-TRA-005');
    expect(
      codeOf(
        await commands().saveWeek(context, id, 2, weekId ?? '', {
          phase: {},
          sessions: [sessionInput()],
        }),
      ),
    ).toBe('NC-TRA-005');
  });

  it('guarda una semana; valida series, ejercicios y que la semana sea de este programa', async () => {
    const id = await withWeek();
    const [weekId = ''] = weekIds(id);
    const save = (version: number, sessions: readonly unknown[], week = weekId) =>
      commands().saveWeek(context, id, version, week, { phase: {}, sessions: sessions as never });

    expect(codeOf(await save(1, [], 'otra'))).toBe('NC-TRA-010');
    expect(codeOf(await save(1, [sessionInput('desconocido')]))).toBe('NC-TRA-017');
    const reversed = await save(1, [
      sessionInput('sentadilla', { ...SET, repsMin: 12, repsMax: 8 }),
    ]);
    expect(codeOf(reversed)).toBe('NC-TRA-009');

    value(await save(1, [sessionInput()]));
    expect(weeksOf(program(id).mesocycles)[0]?.sessions).toHaveLength(1);
    expect(program(id).version).toBe(2);
  });

  it('duplica a otras semanas con filas nuevas; sin sesiones o hacia sí misma, no', async () => {
    const id = await withWeek(3);
    const [first = '', second = '', third = ''] = weekIds(id);

    expect(codeOf(await commands().duplicateWeek(context, id, 1, first, [second]))).toBe(
      'NC-TRA-009',
    );

    value(
      await commands().saveWeek(context, id, 1, first, { phase: {}, sessions: [sessionInput()] }),
    );
    expect(codeOf(await commands().duplicateWeek(context, id, 2, 'otra', [second]))).toBe(
      'NC-TRA-010',
    );
    expect(codeOf(await commands().duplicateWeek(context, id, 2, first, [first]))).toBe(
      'NC-TRA-010',
    );
    expect(codeOf(await commands().duplicateWeek(context, id, 2, first, ['otra']))).toBe(
      'NC-TRA-010',
    );

    value(await commands().duplicateWeek(context, id, 2, first, [second, third, second]));

    const weeks = weeksOf(program(id).mesocycles);
    expect(weeks.map((week) => week.sessions.length)).toEqual([1, 1, 1]);
    expect(new Set(weeks.map((week) => week.sessions[0]?.id)).size).toBe(3);

    programs.touch = () => Promise.resolve(false);
    expect(codeOf(await commands().duplicateWeek(context, id, 3, first, [second]))).toBe(
      'NC-TRA-005',
    );
  });
});

describe('RN-F12 · publicar y versionar', () => {
  const ready = async () => {
    const id = await withWeek();
    const [weekId = ''] = weekIds(id);
    value(
      await commands().saveWeek(context, id, 1, weekId, { phase: {}, sessions: [sessionInput()] }),
    );
    return id;
  };

  it('congela el snapshot, empieza hoy si no dice otra cosa y lo avisa con su evento', async () => {
    const id = await ready();

    const published = value(await commands().publish(context, id, 2));

    expect(published).toEqual({ id, closedKey: false });
    expect(program(id)).toMatchObject({
      status: 'PUBLISHED',
      startDate: '2026-10-31',
      endDate: '2026-11-06',
    });
    expect(programs.snapshots.get(id)).toMatchObject({
      programId: id,
      startDate: '2026-10-31',
      endDate: '2026-11-06',
      totalWeeks: 1,
    });
    expect(types()).toContain('training.program.published');
  });

  it('el publicado anterior pasa a reemplazado, con su evento', async () => {
    const first = await ready();
    value(await commands().publish(context, first, 2));
    const second = await ready();

    value(await commands().publish(context, second, 2));

    expect(program(first).status).toBe('SUPERSEDED');
    expect(types()).toContain('training.program.superseded');
  });

  it('ADR-070: a mano se publica con una llave cerrada, y queda dicho', async () => {
    const id = await ready();
    blocked = true;

    expect(value(await commands().publish(context, id, 2))).toEqual({ id, closedKey: true });
    const event = events.find((e) => e.type === 'training.program.published');
    expect(event?.payload).toMatchObject({ closedKey: true });
  });

  it('RN-F14 · RN-F15: una propuesta, solo aprobada y con las llaves abiertas', async () => {
    const id = value(await commands().propose(context, PATIENT, { name: null })).id;

    const pending = await commands().publish(context, id, 0);
    expect(isErr(pending) && pending.error).toMatchObject({
      code: 'NC-TRA-008',
      details: { problems: ['Faltan 16 ejercicios por aprobar.'] },
    });

    blocked = true;
    expect(codeOf(await commands().publish(context, id, 0))).toBe('NC-TRA-006');
  });

  it('solo un borrador, en su versión, con acceso de escritura', async () => {
    const id = await ready();
    expect(codeOf(await commands().publish(context, 'no-existe', 0))).toBe('NC-TRA-003');
    expect(codeOf(await commands().publish(context, id, 9))).toBe('NC-TRA-005');
    writable = false;
    expect(codeOf(await commands().publish(context, id, 2))).toBe('NC-CLI-013');
    writable = true;
    const realPublish = programs.publish.bind(programs);
    programs.publish = () => Promise.resolve(false);
    expect(codeOf(await commands().publish(context, id, 2))).toBe('NC-TRA-005');
    programs.publish = realPublish;
    value(await commands().publish(context, id, 2));
    expect(codeOf(await commands().publish(context, id, 3))).toBe('NC-TRA-004');
    expect(
      codeOf(
        await commands().saveWeek(context, id, 3, weekIds(id)[0] ?? '', {
          phase: {},
          sessions: [],
        }),
      ),
    ).toBe('NC-TRA-004');
  });

  it('la versión siguiente copia la estructura; un borrador a la vez, y no desde un borrador', async () => {
    const id = await ready();
    expect(isErr(await commands().revise(context, id))).toBe(true);
    value(await commands().publish(context, id, 2));

    const revisionId = value(await commands().revise(context, id)).id;

    expect(program(revisionId)).toMatchObject({
      status: 'DRAFT',
      versionNo: 2,
      lineageId: program(id).lineageId,
      version: 0,
      publishedAt: null,
    });
    expect(weekIds(revisionId)[0]).not.toBe(weekIds(id)[0]);

    const twice = await commands().revise(context, id);
    expect(isErr(twice) && twice.error).toMatchObject({
      code: 'NC-TRA-012',
      details: { draftId: revisionId },
    });
    expect(codeOf(await commands().revise(context, 'no-existe'))).toBe('NC-TRA-003');
    writable = false;
    expect(codeOf(await commands().revise(context, id))).toBe('NC-CLI-013');
  });

  it('copyMesocycles no comparte filas con la original', async () => {
    const id = await ready();
    const copy = copyMesocycles(program(id).mesocycles, () => 'nuevo');

    expect(copy[0]?.id).toBe('nuevo');
    expect(program(id).mesocycles[0]?.id).not.toBe('nuevo');
  });
});

describe('RF-26 · RN-B03 · leer', () => {
  it('sin ver al paciente no hay lista ni READ', async () => {
    visible = false;
    expect(await queries().list(context, PATIENT)).toBeNull();
    expect(audits).toEqual([]);
  });

  it('la lista deja su READ', async () => {
    const id = await manual();

    expect((await queries().list(context, PATIENT))?.map((row) => row.id)).toEqual([id]);
    expect(audits).toMatchObject([
      { action: 'READ', resourceType: 'training.program', patientId: PATIENT },
    ]);
  });

  it('un borrador se arma con la biblioteca de hoy y dice lo que falta', async () => {
    const id = await withWeek();

    const view = await queries().get(context, id);

    expect(view?.document.totalWeeks).toBe(1);
    expect(view?.publishProblems).toEqual(['La semana 1 no tiene sesiones.']);
    expect(audits).toMatchObject([{ action: 'READ', resourceId: id }]);
    expect(await queries().get(context, 'no-existe')).toBeNull();
  });

  it('una propuesta con una llave cerrada lo dice entre lo que falta; a mano, no', async () => {
    const proposed = value(await commands().propose(context, PATIENT, { name: null })).id;
    const byHand = await withWeek();
    blocked = true;

    expect((await queries().get(context, proposed))?.publishProblems[0]).toContain('llave');
    expect((await queries().get(context, byHand))?.publishProblems).toEqual([
      'La semana 1 no tiene sesiones.',
    ]);
  });

  it('lo publicado se lee de su snapshot, y sin snapshot no se inventa', async () => {
    const id = await withWeek();
    const [weekId = ''] = weekIds(id);
    value(
      await commands().saveWeek(context, id, 1, weekId, { phase: {}, sessions: [sessionInput()] }),
    );
    value(await commands().publish(context, id, 2));
    known = [];

    const view = await queries().get(context, id);
    expect(view?.document.totalWeeks).toBe(1);
    expect(view?.publishProblems).toEqual([]);

    programs.snapshots.clear();
    expect(await queries().get(context, id)).toBeNull();
  });

  it('la API pública entrega lo publicado; la línea de tiempo, lo del almacén', async () => {
    const id = await manual();
    const api = new TrainingApi(programs);
    expect(await api.publishedProgram(id)).toBeNull();

    expect(await new TrainingTimelineSource(programs).entries(PATIENT, null, 5)).toEqual([]);
  });
});
