import {
  domainError,
  err,
  isErr,
  ok,
  type DomainEvent,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClinicalApi } from '../../clinical/index.js';
import type { TenancyApi } from '../../tenancy/index.js';
import type { SnapshotProgram, SnapshotSession } from '../domain/training-day.js';
import { itemClientId } from './commands/record.commands.js';
import { RecordGate } from './commands/record-gate.js';
import { TrainingLogCommands, type CheckinInput } from './commands/training-log.commands.js';
import type {
  ActiveSnapshot,
  NewCheckin,
  NewReadiness,
  NewWorkout,
  ReadinessBasis,
  RecordStore,
  StoredCheckin,
  StoredReadiness,
  StoredWorkout,
} from './ports/records.ports.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const USER = '0192f0a0-0000-7000-8000-0000000000e1' as UserId;
const context: SecurityContext = {
  organizationId: ORG,
  userId: USER,
  role: 'PATIENT',
  patientId: PATIENT as SecurityContext['patientId'],
  memberId: null,
};
/** 10:00 en Lima: hoy es 2026-11-02 en la fecha local del paciente (RN-G04). */
const TODAY = '2026-11-02';
const NOW = new Date('2026-11-02T15:00:00.000Z');
const SQUAT = 'exercise-squat';

const KG_SET = {
  setNo: 1,
  setType: 'WORKING' as const,
  repsMin: 8,
  repsMax: 8,
  loadKind: 'KG' as const,
  loadValue: 60,
  restSeconds: 90,
  tempo: null,
  durationSeconds: null,
  distanceM: null,
  met: null,
};
const session = (id: string, position: number): SnapshotSession => ({
  id,
  position,
  name: `Sesión ${String(position)}`,
  dayOfWeek: null,
  notes: null,
  exercises: [
    {
      id: `pe-${id}`,
      exerciseId: SQUAT,
      position: 1,
      name: 'Sentadilla goblet',
      supersetGroup: null,
      notes: null,
      caution: null,
      alternative: null,
      easierVariant: null,
      harderVariant: null,
      mediaUrl: null,
      instructions: null,
      primaryMuscles: [{ code: 'QUADRICEPS', name: 'Cuádriceps' }],
      secondaryMuscles: [{ code: 'GLUTES', name: 'Glúteo' }],
      sets: [KG_SET, { ...KG_SET, setNo: 2 }],
    },
  ],
});
const PROGRAM: SnapshotProgram = {
  programId: 'program-1',
  name: 'Fuerza base',
  startDate: TODAY,
  mesocycles: [
    {
      id: 'meso-1',
      weeks: [
        {
          id: 'week-1',
          weekNo: 1,
          isDeload: false,
          phaseEs: 'Adaptación',
          targetRir: 3,
          sessions: [session('session-1', 1), session('session-2', 2)],
        },
      ],
    },
  ],
};
const BASIS: ReadinessBasis = {
  thresholdId: 'threshold-global',
  baseline: { sleepTargetHours: 8, restingHrBpm: 55, hrvMs: 60 },
  thresholds: {
    neutralScore: 75,
    readinessGreenMin: 75,
    readinessRedBelow: 60,
    performanceMinPct: 90,
  },
};
const EMPTY_DAY = {
  sessionMinutes: null,
  sessionRpe: null,
  sleepHours: null,
  fatigue: null,
  soreness: null,
  stress: null,
  motivation: null,
  menstrualSymptoms: null,
  nutritionCompliancePct: null,
  carbsAroundTrainingG: null,
  performancePlanned: null,
  performanceActual: null,
  restingHrBpm: null,
  hrvMs: null,
  steps: null,
  activeKcal: null,
};
const GOOD_DAY: CheckinInput = {
  ...EMPTY_DAY,
  clientId: 'client-good',
  localDate: TODAY,
  sessionMinutes: 50,
  sessionRpe: 7,
  sleepHours: 8,
  fatigue: 2,
  soreness: 2,
  stress: 2,
  motivation: 4,
  restingHrBpm: 55,
  hrvMs: 60,
};

const missing = (): never => {
  throw new Error('Este caso de uso no usa ese método del store.');
};

/** Los registros del paciente en memoria, con lo que hace la base: clientId único por día y tonelaje sin calentamiento. */
class MemoryRecords {
  readonly checkins: NewCheckin[] = [];
  readonly statuses = new Map<string, 'ACTIVE' | 'VOIDED'>();
  readonly readiness: (NewReadiness & { status: StoredReadiness['status'] })[] = [];
  readonly workouts: NewWorkout[] = [];
  training: ActiveSnapshot | null = { id: 'program-1', effectiveFrom: TODAY, snapshot: PROGRAM };
  basis: ReadinessBasis | null = BASIS;

  insertCheckin(row: NewCheckin) {
    if (!this.checkins.some((c) => c.clientId === row.clientId && c.localDate === row.localDate)) {
      this.checkins.push(row);
      this.statuses.set(row.id, 'ACTIVE');
    }
    return Promise.resolve();
  }
  checkinByClientId(_patientId: string, localDate: string, clientId: string) {
    const row = this.checkins.find((c) => c.clientId === clientId && c.localDate === localDate);
    return Promise.resolve(row ? this.#checkin(row) : null);
  }
  checkin(id: string) {
    const row = this.checkins.find((c) => c.id === id);
    return Promise.resolve(row ? this.#checkin(row) : null);
  }
  activeCheckin(_patientId: string, localDate: string) {
    const row = this.checkins.find(
      (c) => c.localDate === localDate && this.statuses.get(c.id) === 'ACTIVE',
    );
    return Promise.resolve(row ? this.#checkin(row) : null);
  }
  voidCheckin(id: string) {
    this.statuses.set(id, 'VOIDED');
    for (const r of this.readiness.filter((r) => r.checkinId === id)) r.status = 'SUPERSEDED';
    return Promise.resolve();
  }
  insertReadiness(row: NewReadiness) {
    this.readiness.push({ ...row, status: 'CURRENT' });
    return Promise.resolve();
  }
  readinessBasis() {
    return Promise.resolve(this.basis);
  }
  insertWorkout(row: NewWorkout) {
    if (!this.workouts.some((w) => w.clientId === row.clientId && w.localDate === row.localDate)) {
      this.workouts.push(row);
      this.statuses.set(row.id, 'ACTIVE');
    }
    return Promise.resolve();
  }
  workoutByClientId(_patientId: string, localDate: string, clientId: string) {
    const row = this.workouts.find((w) => w.clientId === clientId && w.localDate === localDate);
    return Promise.resolve(row ? this.#workout(row) : null);
  }
  workout(id: string) {
    const row = this.workouts.find((w) => w.id === id);
    return Promise.resolve(row ? this.#workout(row) : null);
  }
  dayWorkouts(_patientId: string, localDate: string) {
    return Promise.resolve(
      this.workouts
        .filter((w) => w.localDate === localDate && this.statuses.get(w.id) === 'ACTIVE')
        .map((w) => this.#workout(w)),
    );
  }
  voidWorkout(id: string) {
    this.statuses.set(id, 'VOIDED');
    return Promise.resolve();
  }
  activeTraining() {
    return Promise.resolve(this.training);
  }

  #checkin(row: NewCheckin): StoredCheckin {
    const readiness = this.readiness.findLast((r) => r.checkinId === row.id);
    return {
      ...row,
      status: this.statuses.get(row.id) ?? 'ACTIVE',
      readiness: readiness
        ? {
            id: readiness.id,
            indication: readiness.indication,
            readinessScore: readiness.readinessScore,
            components: readiness.components,
            neutralComponents: readiness.neutralComponents,
            srpeLoad: readiness.srpeLoad,
            performancePct: readiness.performancePct,
            methodCode: readiness.methodCode,
            methodVersion: readiness.methodVersion,
            status: readiness.status,
          }
        : null,
    };
  }
  #workout(row: NewWorkout): StoredWorkout {
    const effective = row.sets.filter((set) => !set.isWarmup);
    return {
      id: row.id,
      clientId: row.clientId,
      localDate: row.localDate,
      sessionId: row.sessionId,
      outcome: row.outcome,
      durationMinutes:
        row.startedAt && row.finishedAt
          ? (row.finishedAt.getTime() - row.startedAt.getTime()) / 60_000
          : null,
      sessionRpe: row.sessionRpe,
      tonnageKg: effective.reduce((t, set) => t + (set.reps ?? 0) * (set.loadKg ?? 0), 0),
      setCount: row.sets.length,
      status: this.statuses.get(row.id) ?? 'ACTIVE',
    };
  }
}

const MENSTRUAL_REQUIRED = domainError({
  code: 'NC-CLI-032',
  rule: 'RN-G17',
  message: 'Sin consentimiento.',
});
const HEALTH_REQUIRED = domainError({ code: 'NC-CLI-010', rule: 'RN-B01', message: 'Sin datos.' });

let store: MemoryRecords;
let events: DomainEvent[];
let menstrualConsent: boolean;
let healthConsent: boolean;
let patientVisible: boolean;
let sequence: number;

const uow = {
  run: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
  query: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
};
const clock = { now: () => NOW };
const ids = {
  newId: () => {
    sequence += 1;
    return `0192f0a0-0000-7000-8000-${String(sequence).padStart(12, '0')}` as never;
  },
};
const outbox = {
  append: (appended: readonly DomainEvent[]) => {
    events.push(...appended);
    return Promise.resolve();
  },
};
const clinical = {
  ensureHealthDataConsent: () =>
    Promise.resolve(healthConsent ? ok(undefined) : err(HEALTH_REQUIRED)),
  ensureMenstrualTrackingConsent: () =>
    Promise.resolve(menstrualConsent ? ok(undefined) : err(MENSTRUAL_REQUIRED)),
  patientRef: () => Promise.resolve(patientVisible ? { timezone: 'America/Lima' } : null),
} as unknown as ClinicalApi;
const tenancy = { trackingEditWindowDays: () => Promise.resolve(3) } as unknown as TenancyApi;

const commands = () =>
  new TrainingLogCommands(
    uow,
    clock,
    ids,
    new Proxy(store, {
      get: (target, key) => {
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as () => unknown).bind(target) : missing;
      },
    }) as unknown as RecordStore,
    new RecordGate(clock, ids, outbox, clinical, tenancy),
    clinical,
  );

const types = () => events.map((event) => event.type);

beforeEach(() => {
  store = new MemoryRecords();
  events = [];
  menstrualConsent = false;
  healthConsent = true;
  patientVisible = true;
  sequence = 0;
});

describe('RN-G11 · RN-G14 · RN-G15 · el registro diario calcula la indicación del día', () => {
  it('con su método, su umbral y el hash de sus insumos (RN-D01); deja su evento', async () => {
    const result = await commands().logCheckin(context, GOOD_DAY);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.replayed).toBe(false);
    expect(result.value.value.readiness).toMatchObject({
      indication: 'GREEN',
      readinessScore: 95,
      srpeLoad: 350,
      performancePct: null,
      methodCode: 'READINESS_JV',
      status: 'CURRENT',
    });
    expect(store.readiness[0]).toMatchObject({
      thresholdId: 'threshold-global',
      computedAt: NOW,
      inputsHash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
    });
    expect(store.checkins[0]).toMatchObject({
      programId: 'program-1',
      weekNo: 1,
      sessionId: 'session-1',
    });
    expect(types()).toEqual(['tracking.checkin.logged']);
  });

  it('RN-G08: el mismo clientId devuelve lo de la primera vez, sin otro cálculo', async () => {
    await commands().logCheckin(context, GOOD_DAY);
    const again = await commands().logCheckin(context, GOOD_DAY);

    expect(isErr(again) ? null : again.value.replayed).toBe(true);
    expect(store.checkins).toHaveLength(1);
    expect(store.readiness).toHaveLength(1);
  });

  it('RN-G12: otro registro el mismo día anula el anterior y su recuperación', async () => {
    await commands().logCheckin(context, GOOD_DAY);
    const corrected = await commands().logCheckin(context, {
      ...GOOD_DAY,
      clientId: 'client-corrected',
      sleepHours: 5,
    });

    expect(isErr(corrected)).toBe(false);
    expect(store.statuses.get(store.checkins[0]?.id ?? '')).toBe('VOIDED');
    expect(store.readiness.map((r) => r.status)).toEqual(['SUPERSEDED', 'CURRENT']);
    expect(types()).toEqual([
      'tracking.checkin.logged',
      'tracking.checkin.voided',
      'tracking.checkin.logged',
    ]);
  });

  it('RN-G17: sin MENSTRUAL_TRACKING los síntomas del ciclo se rechazan; con él, síntomas en 3 dan rojo', async () => {
    const denied = await commands().logCheckin(context, { ...GOOD_DAY, menstrualSymptoms: 1 });
    expect(isErr(denied) ? denied.error.code : null).toBe('NC-CLI-032');
    expect(store.checkins).toEqual([]);

    menstrualConsent = true;
    const red = await commands().logCheckin(context, { ...GOOD_DAY, menstrualSymptoms: 3 });
    expect(isErr(red) ? null : red.value.value.readiness?.indication).toBe('RED');
  });

  it('RN-B01 · RN-G10: sin HEALTH_DATA, en un día futuro o fuera de la ventana, no se registra', async () => {
    healthConsent = false;
    const noConsent = await commands().logCheckin(context, GOOD_DAY);
    expect(isErr(noConsent) ? noConsent.error.code : null).toBe('NC-CLI-010');

    healthConsent = true;
    const future = await commands().logCheckin(context, { ...GOOD_DAY, localDate: '2026-11-03' });
    expect(isErr(future) ? future.error.code : null).toBe('NC-TRK-001');
    const closed = await commands().logCheckin(context, { ...GOOD_DAY, localDate: '2026-10-29' });
    expect(isErr(closed) ? closed.error.code : null).toBe('NC-TRK-002');

    patientVisible = false;
    const unknown = await commands().logCheckin(context, GOOD_DAY);
    expect(isErr(unknown) ? unknown.error.code : null).toBe('NC-CLI-005');
    expect(store.checkins).toEqual([]);
  });

  it('una línea base fuera de rango no da indicación: NC-TRK-012; sin umbral vigente es un error de la base', async () => {
    store.basis = { ...BASIS, baseline: { ...BASIS.baseline, restingHrBpm: 500 } };
    const invalid = await commands().logCheckin(context, GOOD_DAY);
    expect(isErr(invalid) ? invalid.error.code : null).toBe('NC-TRK-012');
    expect(store.checkins).toEqual([]);

    store.basis = null;
    await expect(commands().logCheckin(context, GOOD_DAY)).rejects.toThrow('umbral');
  });

  it('antes del programa o sin él, el registro diario no lleva programa ni sesión', async () => {
    store.training = null;
    await commands().logCheckin(context, GOOD_DAY);
    expect(store.checkins[0]).toMatchObject({ programId: null, weekNo: null, sessionId: null });
  });

  it('07 §8: después de su última semana, tampoco', async () => {
    store.training = ENDED_PROGRAM;
    await commands().logCheckin(context, GOOD_DAY);
    expect(store.checkins[0]).toMatchObject({ programId: null, weekNo: null, sessionId: null });
  });
});

describe('P-09 · ADR-080 · el rendimiento del registro diario', () => {
  const squatSets = (reps: number) => [
    { ...LOGGED_SET, setNo: 1, isWarmup: true, reps: 10, loadKg: 20 },
    { ...LOGGED_SET, setNo: 2, reps, loadKg: 60 },
    { ...LOGGED_SET, setNo: 3, reps, loadKg: 60 },
  ];

  it('con la sesión registrada, lo prescrito frente a lo registrado, aunque el paciente escriba otro par', async () => {
    await commands().logWorkout(context, { ...WORKOUT, sets: squatSets(6) });
    const result = await commands().logCheckin(context, {
      ...GOOD_DAY,
      performancePlanned: 10,
      performanceActual: 10,
    });

    expect(isErr(result) ? null : result.value.value.readiness).toMatchObject({
      performancePct: 75,
      indication: 'YELLOW',
    });
  });

  it('sin sesión registrada, vale el par que escribe el paciente', async () => {
    const result = await commands().logCheckin(context, {
      ...GOOD_DAY,
      performancePlanned: 10,
      performanceActual: 9.5,
    });
    expect(isErr(result) ? null : result.value.value.readiness?.performancePct).toBe(95);
  });

  it('una sesión marcada como hecha sin series no da 0 % ni amarillo: no dice nada del rendimiento', async () => {
    await commands().logWorkout(context, { ...WORKOUT, sets: [] });

    const alone = await commands().logCheckin(context, GOOD_DAY);
    expect(isErr(alone) ? null : alone.value.value.readiness).toMatchObject({
      performancePct: null,
      indication: 'GREEN',
    });

    const written = await commands().logCheckin(context, {
      ...GOOD_DAY,
      clientId: 'client-written',
      performancePlanned: 10,
      performanceActual: 9.5,
    });
    expect(isErr(written) ? null : written.value.value.readiness?.performancePct).toBe(95);
  });

  it('series sin peso tampoco valen 0 %', async () => {
    await commands().logWorkout(context, {
      ...WORKOUT,
      sets: [{ ...LOGGED_SET, loadKg: null }],
    });
    const result = await commands().logCheckin(context, GOOD_DAY);
    expect(isErr(result) ? null : result.value.value.readiness?.performancePct).toBeNull();
  });

  it('RN-D08: anular el entreno no recalcula el registro diario ya hecho', async () => {
    const logged = await commands().logWorkout(context, { ...WORKOUT, sets: squatSets(6) });
    await commands().logCheckin(context, GOOD_DAY);
    const before = structuredClone(store.readiness);

    await commands().voidWorkout(context, isErr(logged) ? '' : logged.value.value.id);

    expect(store.readiness).toEqual(before);
    expect(store.statuses.get(store.checkins[0]?.id ?? '')).toBe('ACTIVE');
  });

  it('una sesión omitida no cuenta como registrada', async () => {
    await commands().logWorkout(context, { ...WORKOUT, outcome: 'SKIPPED', sets: [] });
    const result = await commands().logCheckin(context, GOOD_DAY);
    expect(isErr(result) ? null : result.value.value.readiness?.performancePct).toBeNull();
  });
});

describe('RN-G12 · anular el registro diario', () => {
  it('deja su recuperación reemplazada; uno que no existe o ya anulado, no', async () => {
    const logged = await commands().logCheckin(context, GOOD_DAY);
    const id = isErr(logged) ? '' : logged.value.value.id;

    const voided = await commands().voidCheckin(context, id);
    expect(isErr(voided) ? null : voided.value).toMatchObject({
      status: 'VOIDED',
      readiness: { status: 'SUPERSEDED' },
    });
    const twice = await commands().voidCheckin(context, id);
    expect(isErr(twice) ? twice.error.code : null).toBe('NC-TRK-006');
    const unknown = await commands().voidCheckin(context, 'otro');
    expect(isErr(unknown) ? unknown.error.code : null).toBe('NC-TRK-005');
  });

  it('sin registro diario calculado, anularlo no inventa una recuperación', async () => {
    store.checkins.push({
      ...GOOD_DAY,
      ...EMPTY_DAY,
      id: 'sin-calculo',
      organizationId: ORG,
      patientId: PATIENT,
      programId: null,
      weekNo: null,
      sessionId: null,
    });
    store.statuses.set('sin-calculo', 'ACTIVE');
    const voided = await commands().voidCheckin(context, 'sin-calculo');
    expect(isErr(voided) ? null : voided.value.readiness).toBeNull();
  });
});

const LOGGED_SET = {
  exerciseId: SQUAT,
  setNo: 1,
  isWarmup: false,
  reps: 8,
  loadKg: 60,
  rir: 2,
  rpe: null,
  durationSeconds: null,
  distanceM: null,
  met: null,
  stimulus: null,
  fatigue: null,
};
const WORKOUT = {
  clientId: 'client-workout',
  localDate: TODAY,
  sessionId: 'session-1',
  outcome: 'COMPLETED' as const,
  durationMinutes: 50,
  sessionRpe: 7,
  stimulus: null,
  fatigue: null,
  notes: null,
  sets: [LOGGED_SET, { ...LOGGED_SET, setNo: 2 }],
};

describe('RF-29 · RN-F06 · registrar el entreno', () => {
  it('en su semana y su mesociclo, con los músculos congelados y un clientId por serie; deja su evento', async () => {
    const result = await commands().logWorkout(context, WORKOUT);

    expect(isErr(result) ? null : result.value).toMatchObject({
      replayed: false,
      value: { tonnageKg: 960, setCount: 2, durationMinutes: 50 },
    });
    const [stored] = store.workouts;
    expect(stored).toMatchObject({
      mesocycleId: 'meso-1',
      weekNo: 1,
      isDeload: false,
      finishedAt: NOW,
    });
    expect(stored?.sets.map((set) => set.clientId)).toEqual([
      itemClientId('client-workout', 1),
      itemClientId('client-workout', 2),
    ]);
    expect(stored?.sets[0]).toMatchObject({
      exerciseName: 'Sentadilla goblet',
      muscleContributions: [
        { muscle: 'QUADRICEPS', weight: 1 },
        { muscle: 'GLUTES', weight: 0.5 },
      ],
    });
    expect(types()).toEqual(['tracking.workout.logged']);

    const again = await commands().logWorkout(context, WORKOUT);
    expect(isErr(again) ? null : again.value.replayed).toBe(true);
    expect(store.workouts).toHaveLength(1);
  });

  it('sin sesión, cualquier ejercicio del programa, en la semana del día; sin minutos, sin horas', async () => {
    const result = await commands().logWorkout(context, {
      ...WORKOUT,
      sessionId: null,
      durationMinutes: null,
    });

    expect(isErr(result)).toBe(false);
    expect(store.workouts[0]).toMatchObject({
      sessionId: null,
      weekNo: 1,
      startedAt: null,
      finishedAt: null,
    });
  });

  it('sin programa vigente, con una sesión ajena o un ejercicio que no está: 422', async () => {
    const unknownSession = await commands().logWorkout(context, { ...WORKOUT, sessionId: 'otra' });
    expect(isErr(unknownSession) ? unknownSession.error.code : null).toBe('NC-TRK-011');
    const unknownExercise = await commands().logWorkout(context, {
      ...WORKOUT,
      sets: [{ ...LOGGED_SET, exerciseId: 'otro' }],
    });
    expect(isErr(unknownExercise) ? unknownExercise.error.code : null).toBe('NC-TRK-011');

    store.training = { ...PROGRAM_ACTIVE, effectiveFrom: '2026-11-05' };
    const early = await commands().logWorkout(context, WORKOUT);
    expect(isErr(early) ? early.error.code : null).toBe('NC-TRK-010');
    store.training = ENDED_PROGRAM;
    const late = await commands().logWorkout(context, WORKOUT);
    expect(isErr(late) ? late.error.code : null).toBe('NC-TRK-010');
    store.training = null;
    const none = await commands().logWorkout(context, WORKOUT);
    expect(isErr(none) ? none.error.code : null).toBe('NC-TRK-010');

    healthConsent = false;
    const noConsent = await commands().logWorkout(context, WORKOUT);
    expect(isErr(noConsent) ? noConsent.error.code : null).toBe('NC-CLI-010');
    expect(store.workouts).toEqual([]);
  });

  it('RN-G12: anularlo conserva lo registrado; uno que no existe o ya anulado, no', async () => {
    const logged = await commands().logWorkout(context, WORKOUT);
    const id = isErr(logged) ? '' : logged.value.value.id;

    const voided = await commands().voidWorkout(context, id);
    expect(isErr(voided) ? null : voided.value).toMatchObject({ status: 'VOIDED', tonnageKg: 960 });
    expect(types()).toEqual(['tracking.workout.logged', 'tracking.workout.voided']);
    const twice = await commands().voidWorkout(context, id);
    expect(isErr(twice) ? twice.error.code : null).toBe('NC-TRK-006');
    const unknown = await commands().voidWorkout(context, 'otro');
    expect(isErr(unknown) ? unknown.error.code : null).toBe('NC-TRK-005');
  });
});

const PROGRAM_ACTIVE: ActiveSnapshot = { id: 'program-1', effectiveFrom: TODAY, snapshot: PROGRAM };
/** Una sola semana que empezó hace 14 días: hoy ya terminó. */
const ENDED_PROGRAM: ActiveSnapshot = {
  id: 'program-1',
  effectiveFrom: '2026-10-19',
  snapshot: { ...PROGRAM, startDate: '2026-10-19' },
};
