import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  ActiveSnapshot,
  DayTargetRow,
  Indication,
  NewCheckin,
  NewAdjustment,
  NewFoodLog,
  NewReadiness,
  NewRecord,
  NewWorkout,
  ReadinessBasis,
  ReadinessComponentCode,
  RecordStatus,
  RecordStore,
  AdjustmentTarget,
  StoredAdjustment,
  StoredCheckin,
  StoredFoodLog,
  StoredHydrationLog,
  StoredMetric,
  StoredNote,
  StoredReadiness,
  StoredSetLog,
  StoredWorkout,
  WorkoutOutcome,
} from '../../../application/ports/records.ports.js';
import type { FoodLogDraft } from '../../../domain/records.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

const FOOD_LOG = {
  id: true,
  clientId: true,
  localDate: true,
  loggedAt: true,
  mealSlotCode: true,
  planId: true,
  itemType: true,
  itemName: true,
  exchangeGroupCode: true,
  servings: true,
  grams: true,
  householdText: true,
  kcal: true,
  choG: true,
  proteinG: true,
  fatG: true,
  inPlan: true,
  status: true,
} as const;

interface FoodLogModel {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: Date;
  readonly loggedAt: Date;
  readonly mealSlotCode: string;
  readonly planId: string | null;
  readonly itemType: string;
  readonly itemName: string;
  readonly exchangeGroupCode: string | null;
  readonly servings: { toString(): string } | null;
  readonly grams: { toString(): string } | null;
  readonly householdText: string | null;
  readonly kcal: { toString(): string } | null;
  readonly choG: { toString(): string } | null;
  readonly proteinG: { toString(): string } | null;
  readonly fatG: { toString(): string } | null;
  readonly inPlan: boolean;
  readonly status: string;
}

const toFoodLog = (row: FoodLogModel): StoredFoodLog => ({
  id: row.id,
  clientId: row.clientId,
  localDate: isoDate(row.localDate),
  loggedAt: row.loggedAt,
  mealSlotCode: row.mealSlotCode,
  planId: row.planId,
  itemType: row.itemType as FoodLogDraft['itemType'],
  itemName: row.itemName,
  exchangeGroupCode: row.exchangeGroupCode,
  servings: num(row.servings),
  grams: num(row.grams),
  householdText: row.householdText,
  kcal: num(row.kcal),
  choG: num(row.choG),
  proteinG: num(row.proteinG),
  fatG: num(row.fatG),
  inPlan: row.inPlan,
  status: row.status as RecordStatus,
});

const HYDRATION = {
  id: true,
  clientId: true,
  localDate: true,
  loggedAt: true,
  volumeMl: true,
  status: true,
} as const;

const toHydration = (row: {
  id: string;
  clientId: string;
  localDate: Date;
  loggedAt: Date;
  volumeMl: number;
  status: string;
}): StoredHydrationLog => ({
  ...row,
  localDate: isoDate(row.localDate),
  status: row.status as RecordStatus,
});

const NOTE = {
  id: true,
  clientId: true,
  localDate: true,
  body: true,
  createdAt: true,
  readAt: true,
} as const;

const toNote = (row: {
  id: string;
  clientId: string;
  localDate: Date;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}): StoredNote => ({ ...row, localDate: isoDate(row.localDate) });

const SET = {
  id: true,
  workoutLogId: true,
  localDate: true,
  exerciseId: true,
  exerciseName: true,
  setNo: true,
  isWarmup: true,
  reps: true,
  loadKg: true,
  rir: true,
  rpe: true,
  durationSeconds: true,
  distanceM: true,
  tonnageKg: true,
  status: true,
} as const;

const toSet = (row: {
  id: string;
  workoutLogId: string;
  localDate: Date;
  exerciseId: string;
  exerciseName: string;
  setNo: number;
  isWarmup: boolean;
  reps: number | null;
  loadKg: { toString(): string } | null;
  rir: number | null;
  rpe: { toString(): string } | null;
  durationSeconds: number | null;
  distanceM: { toString(): string } | null;
  tonnageKg: { toString(): string } | null;
  status: string;
}): StoredSetLog => ({
  ...row,
  localDate: isoDate(row.localDate),
  loadKg: num(row.loadKg),
  rpe: num(row.rpe),
  distanceM: num(row.distanceM),
  tonnageKg: Number(row.tonnageKg ?? 0),
  status: row.status as RecordStatus,
});

const ADJUSTMENT = {
  id: true,
  targetType: true,
  targetId: true,
  targetLocalDate: true,
  action: true,
  correctedValues: true,
  reason: true,
  authorMemberId: true,
  createdAt: true,
} as const;

const toAdjustment = (row: {
  id: string;
  targetType: string;
  targetId: string;
  targetLocalDate: Date;
  action: string;
  correctedValues: unknown;
  reason: string;
  authorMemberId: string;
  createdAt: Date;
}): StoredAdjustment => ({
  ...row,
  targetType: row.targetType as AdjustmentTarget,
  targetLocalDate: isoDate(row.targetLocalDate),
  action: row.action as StoredAdjustment['action'],
  correctedValues: (row.correctedValues ?? null) as StoredAdjustment['correctedValues'],
});

const METRIC = {
  id: true,
  clientId: true,
  localDate: true,
  metricCode: true,
  value: true,
  status: true,
} as const;

const toMetric = (row: {
  id: string;
  clientId: string;
  localDate: Date;
  metricCode: string;
  value: { toString(): string };
  status: string;
}): StoredMetric => ({
  ...row,
  localDate: isoDate(row.localDate),
  value: Number(row.value),
  status: row.status as RecordStatus,
});

type Dec = { toString(): string } | null;

const CHECKIN = {
  id: true,
  clientId: true,
  localDate: true,
  status: true,
  sessionMinutes: true,
  sessionRpe: true,
  sleepHours: true,
  fatigue: true,
  soreness: true,
  stress: true,
  motivation: true,
  menstrualSymptoms: true,
  nutritionCompliancePct: true,
  carbsAroundTrainingG: true,
  performancePlanned: true,
  performanceActual: true,
  restingHrBpm: true,
  hrvMs: true,
  steps: true,
  activeKcal: true,
} as const;

interface CheckinModel {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: Date;
  readonly status: string;
  readonly sessionMinutes: number | null;
  readonly sessionRpe: Dec;
  readonly sleepHours: Dec;
  readonly fatigue: number | null;
  readonly soreness: number | null;
  readonly stress: number | null;
  readonly motivation: number | null;
  readonly menstrualSymptoms: number | null;
  readonly nutritionCompliancePct: number | null;
  readonly carbsAroundTrainingG: Dec;
  readonly performancePlanned: Dec;
  readonly performanceActual: Dec;
  readonly restingHrBpm: number | null;
  readonly hrvMs: Dec;
  readonly steps: number | null;
  readonly activeKcal: Dec;
}

const toCheckin = (row: CheckinModel, readiness: StoredReadiness | null): StoredCheckin => ({
  ...row,
  localDate: isoDate(row.localDate),
  status: row.status as RecordStatus,
  sessionRpe: num(row.sessionRpe),
  sleepHours: num(row.sleepHours),
  carbsAroundTrainingG: num(row.carbsAroundTrainingG),
  performancePlanned: num(row.performancePlanned),
  performanceActual: num(row.performanceActual),
  hrvMs: num(row.hrvMs),
  activeKcal: num(row.activeKcal),
  readiness,
});

const READINESS = {
  id: true,
  checkinId: true,
  indication: true,
  readinessScore: true,
  components: true,
  srpeLoad: true,
  performancePct: true,
  methodCode: true,
  methodVersion: true,
  status: true,
} as const;

/** components en la base: { scores: {sleep, heartRate, hrv, subjective}, neutral: [...] }. */
interface ComponentsJson {
  readonly scores: Readonly<Record<ReadinessComponentCode, number>>;
  readonly neutral: readonly ReadinessComponentCode[];
}

const toReadiness = (row: {
  id: string;
  indication: string;
  readinessScore: Dec;
  components: unknown;
  srpeLoad: Dec;
  performancePct: Dec;
  methodCode: string;
  methodVersion: string;
  status: string;
}): StoredReadiness => {
  const components = row.components as ComponentsJson;
  return {
    id: row.id,
    indication: row.indication as Indication,
    readinessScore: num(row.readinessScore),
    components: components.scores,
    neutralComponents: components.neutral,
    srpeLoad: num(row.srpeLoad),
    performancePct: num(row.performancePct),
    methodCode: row.methodCode,
    methodVersion: row.methodVersion,
    status: row.status as StoredReadiness['status'],
  };
};

const WORKOUT = {
  id: true,
  clientId: true,
  localDate: true,
  sessionId: true,
  outcome: true,
  startedAt: true,
  finishedAt: true,
  sessionRpe: true,
  status: true,
} as const;

const MS_PER_MINUTE = 60_000;

const base = (row: NewRecord) => ({
  id: row.id,
  organizationId: row.organizationId,
  patientId: row.patientId,
  localDate: asDate(row.localDate),
  clientId: row.clientId,
});

/** Una fecha del snapshot: YYYY-MM-DD o null. */
const snapshotDate = (snapshot: unknown, key: string): string | null => {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.slice(0, 10) : null;
};

/**
 * Los registros del paciente con Prisma, en la transacción de la UnitOfWork: la RLS deja al paciente solo lo suyo (RN-G01). Las
 * inserciones no duplican un clientId (ON CONFLICT DO NOTHING sobre los índices *_idem, RN-G08) y anular solo cambia el estado:
 * app_user no tiene otro UPDATE en tracking (RN-G12).
 */
@Injectable()
export class PrismaRecordStore implements RecordStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async insertFoodLogs(rows: readonly NewFoodLog[]): Promise<void> {
    await this.db.tx.foodLog.createMany({
      data: rows.map((row) => ({
        ...base(row),
        loggedAt: row.loggedAt,
        mealSlotCode: row.draft.mealSlotCode,
        planId: row.planId,
        planMealId: row.draft.planMealId,
        itemType: row.draft.itemType,
        itemId: row.draft.itemId,
        itemName: row.draft.itemName,
        exchangeGroupCode: row.draft.exchangeGroupCode,
        servings: row.draft.servings,
        grams: row.draft.grams,
        householdText: row.draft.householdText,
        kcal: row.draft.nutrients.kcal,
        choG: row.draft.nutrients.choG,
        proteinG: row.draft.nutrients.proteinG,
        fatG: row.draft.nutrients.fatG,
        nutrients: row.draft.nutrients.micronutrients,
        inPlan: row.draft.inPlan,
        createdBy: row.createdBy,
      })),
      skipDuplicates: true,
    });
  }

  async foodLogsByClientIds(
    patientId: string,
    localDate: string,
    clientIds: readonly string[],
  ): Promise<readonly StoredFoodLog[]> {
    const rows = await this.db.tx.foodLog.findMany({
      where: { patientId, localDate: asDate(localDate), clientId: { in: [...clientIds] } },
      select: FOOD_LOG,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toFoodLog);
  }

  async foodLog(id: string): Promise<StoredFoodLog | null> {
    const row = await this.db.tx.foodLog.findFirst({ where: { id }, select: FOOD_LOG });
    return row ? toFoodLog(row) : null;
  }

  async voidFoodLog(id: string, localDate: string, replacedById: string | null): Promise<void> {
    await this.db.tx.foodLog.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED', replacedById },
    });
  }

  async dayFoodLogs(patientId: string, localDate: string): Promise<readonly StoredFoodLog[]> {
    const rows = await this.db.tx.foodLog.findMany({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: FOOD_LOG,
      orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toFoodLog);
  }

  async insertHydration(
    row: NewRecord & { readonly loggedAt: Date; readonly volumeMl: number },
  ): Promise<void> {
    await this.db.tx.hydrationLog.createMany({
      data: [{ ...base(row), loggedAt: row.loggedAt, volumeMl: row.volumeMl }],
      skipDuplicates: true,
    });
  }

  async hydrationByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredHydrationLog | null> {
    const row = await this.db.tx.hydrationLog.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: HYDRATION,
    });
    return row ? toHydration(row) : null;
  }

  async hydrationLog(id: string): Promise<StoredHydrationLog | null> {
    const row = await this.db.tx.hydrationLog.findFirst({ where: { id }, select: HYDRATION });
    return row ? toHydration(row) : null;
  }

  async voidHydration(id: string, localDate: string): Promise<void> {
    await this.db.tx.hydrationLog.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED' },
    });
  }

  async dayHydration(patientId: string, localDate: string): Promise<readonly StoredHydrationLog[]> {
    const rows = await this.db.tx.hydrationLog.findMany({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: HYDRATION,
      orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toHydration);
  }

  async insertNote(row: NewRecord & { readonly body: string }): Promise<void> {
    await this.db.tx.noteLog.createMany({
      data: [{ ...base(row), body: row.body }],
      skipDuplicates: true,
    });
  }

  async noteByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredNote | null> {
    const row = await this.db.tx.noteLog.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: NOTE,
    });
    return row ? toNote(row) : null;
  }

  async dayNotes(patientId: string, localDate: string): Promise<readonly StoredNote[]> {
    const rows = await this.db.tx.noteLog.findMany({
      where: { patientId, localDate: asDate(localDate) },
      select: NOTE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toNote);
  }

  async insertMetric(
    row: NewRecord & {
      readonly metricCode: string;
      readonly value: number;
      readonly measuredAt: Date;
    },
  ): Promise<void> {
    await this.db.tx.metricLog.createMany({
      data: [
        { ...base(row), metricCode: row.metricCode, value: row.value, measuredAt: row.measuredAt },
      ],
      skipDuplicates: true,
    });
  }

  async metricByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredMetric | null> {
    const row = await this.db.tx.metricLog.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: METRIC,
    });
    return row ? toMetric(row) : null;
  }

  async metricLog(id: string): Promise<StoredMetric | null> {
    const row = await this.db.tx.metricLog.findFirst({ where: { id }, select: METRIC });
    return row ? toMetric(row) : null;
  }

  async voidMetric(id: string, localDate: string): Promise<void> {
    await this.db.tx.metricLog.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED' },
    });
  }

  async dayMetrics(patientId: string, localDate: string): Promise<readonly StoredMetric[]> {
    const rows = await this.db.tx.metricLog.findMany({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: METRIC,
      orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMetric);
  }

  async metricRange(
    code: string,
  ): Promise<{ readonly min: number | null; readonly max: number | null } | null> {
    const row = await this.db.tx.metricDefinition.findFirst({
      where: { code, isActive: true },
      select: { minValue: true, maxValue: true },
    });
    return row ? { min: num(row.minValue), max: num(row.maxValue) } : null;
  }

  async insertCheckin(row: NewCheckin): Promise<void> {
    await this.db.tx.dailyCheckin.createMany({
      data: [
        {
          ...base(row),
          programId: row.programId,
          weekNo: row.weekNo,
          sessionId: row.sessionId,
          sessionMinutes: row.sessionMinutes,
          sessionRpe: row.sessionRpe,
          sleepHours: row.sleepHours,
          fatigue: row.fatigue,
          soreness: row.soreness,
          stress: row.stress,
          motivation: row.motivation,
          menstrualSymptoms: row.menstrualSymptoms,
          nutritionCompliancePct: row.nutritionCompliancePct,
          carbsAroundTrainingG: row.carbsAroundTrainingG,
          performancePlanned: row.performancePlanned,
          performanceActual: row.performanceActual,
          restingHrBpm: row.restingHrBpm,
          hrvMs: row.hrvMs,
          steps: row.steps,
          activeKcal: row.activeKcal,
        },
      ],
      skipDuplicates: true,
    });
  }

  async checkinByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredCheckin | null> {
    const row = await this.db.tx.dailyCheckin.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: CHECKIN,
    });
    return row ? this.#withReadiness(row) : null;
  }

  async checkin(id: string): Promise<StoredCheckin | null> {
    const row = await this.db.tx.dailyCheckin.findFirst({ where: { id }, select: CHECKIN });
    return row ? this.#withReadiness(row) : null;
  }

  async activeCheckin(patientId: string, localDate: string): Promise<StoredCheckin | null> {
    const row = await this.db.tx.dailyCheckin.findFirst({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: CHECKIN,
    });
    return row ? this.#withReadiness(row) : null;
  }

  async voidCheckin(id: string, localDate: string): Promise<void> {
    await this.db.tx.dailyCheckin.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED' },
    });
    await this.db.tx.dailyReadiness.updateMany({
      where: { checkinId: id, localDate: asDate(localDate), status: 'CURRENT' },
      data: { status: 'SUPERSEDED' },
    });
  }

  async insertReadiness(row: NewReadiness): Promise<void> {
    const components: ComponentsJson = {
      scores: row.components,
      neutral: row.neutralComponents,
    };
    await this.db.tx.dailyReadiness.createMany({
      data: [
        {
          id: row.id,
          organizationId: row.organizationId,
          patientId: row.patientId,
          localDate: asDate(row.localDate),
          checkinId: row.checkinId,
          methodCode: row.methodCode,
          methodVersion: row.methodVersion,
          engineVersion: row.engineVersion,
          thresholdId: row.thresholdId,
          inputs: JSON.parse(JSON.stringify(row.inputs)) as object,
          inputsHash: new Uint8Array(Buffer.from(row.inputsHash, 'hex')),
          srpeLoad: row.srpeLoad,
          performancePct: row.performancePct,
          readinessScore: row.readinessScore,
          components: JSON.parse(JSON.stringify(components)) as object,
          indication: row.indication,
          computedAt: row.computedAt,
        },
      ],
    });
  }

  async readinessBasis(localDate: string): Promise<ReadinessBasis | null> {
    const [row] = await this.db.tx.$queryRaw<
      {
        sleep_target_hours: Dec;
        baseline_resting_hr_bpm: number | null;
        baseline_hrv_ms: Dec;
        threshold_id: string;
        neutral_score: Dec;
        readiness_green_min: Dec;
        readiness_red_below: Dec;
        performance_min_pct: Dec;
      }[]
    >`SELECT * FROM app.readiness_basis(${localDate}::date)`;
    if (!row) return null;
    return {
      thresholdId: row.threshold_id,
      baseline: {
        sleepTargetHours: num(row.sleep_target_hours),
        restingHrBpm: row.baseline_resting_hr_bpm,
        hrvMs: num(row.baseline_hrv_ms),
      },
      thresholds: {
        neutralScore: Number(row.neutral_score),
        readinessGreenMin: Number(row.readiness_green_min),
        readinessRedBelow: Number(row.readiness_red_below),
        performanceMinPct: Number(row.performance_min_pct),
      },
    };
  }

  async insertWorkout(row: NewWorkout): Promise<void> {
    await this.db.tx.workoutLog.createMany({
      data: [
        {
          ...base(row),
          programId: row.programId,
          sessionId: row.sessionId,
          mesocycleId: row.mesocycleId,
          weekNo: row.weekNo,
          isDeload: row.isDeload,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          outcome: row.outcome,
          sessionRpe: row.sessionRpe,
          stimulusRating: row.stimulus,
          fatigueRating: row.fatigue,
          notes: row.notes,
        },
      ],
      skipDuplicates: true,
    });
    if (row.sets.length === 0) return;
    await this.db.tx.setLog.createMany({
      data: row.sets.map((set) => ({
        id: set.id,
        organizationId: row.organizationId,
        patientId: row.patientId,
        localDate: asDate(row.localDate),
        clientId: set.clientId,
        workoutLogId: row.id,
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        muscleContributions: set.muscleContributions.map((c) => ({ ...c })),
        setNo: set.setNo,
        isWarmup: set.isWarmup,
        reps: set.reps,
        loadKg: set.loadKg,
        rir: set.rir,
        rpe: set.rpe,
        durationSeconds: set.durationSeconds,
        distanceM: set.distanceM,
        met: set.met,
        stimulusRating: set.stimulus,
        fatigueRating: set.fatigue,
      })),
      skipDuplicates: true,
    });
  }

  async workoutByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredWorkout | null> {
    const row = await this.db.tx.workoutLog.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: WORKOUT,
    });
    return row ? ((await this.#withTonnage([row]))[0] ?? null) : null;
  }

  async workout(id: string): Promise<StoredWorkout | null> {
    const row = await this.db.tx.workoutLog.findFirst({ where: { id }, select: WORKOUT });
    return row ? ((await this.#withTonnage([row]))[0] ?? null) : null;
  }

  async dayWorkouts(patientId: string, localDate: string): Promise<readonly StoredWorkout[]> {
    const rows = await this.db.tx.workoutLog.findMany({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: WORKOUT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return this.#withTonnage(rows);
  }

  async voidWorkout(id: string, localDate: string): Promise<void> {
    await this.db.tx.workoutLog.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED' },
    });
    await this.db.tx.setLog.updateMany({
      where: { workoutLogId: id, localDate: asDate(localDate) },
      data: { status: 'VOIDED' },
    });
  }

  async #withReadiness(row: CheckinModel): Promise<StoredCheckin> {
    const readiness = await this.db.tx.dailyReadiness.findFirst({
      where: { checkinId: row.id, localDate: row.localDate },
      select: READINESS,
      orderBy: [{ computedAt: 'desc' }, { id: 'desc' }],
    });
    return toCheckin(row, readiness ? toReadiness(readiness) : null);
  }

  /** El tonelaje y las series de cada entreno: la suma de tonnage_kg de sus series vigentes (RN-F03). */
  async #withTonnage(
    rows: readonly {
      id: string;
      clientId: string;
      localDate: Date;
      sessionId: string | null;
      outcome: string;
      startedAt: Date | null;
      finishedAt: Date | null;
      sessionRpe: Dec;
      status: string;
    }[],
  ): Promise<StoredWorkout[]> {
    if (rows.length === 0) return [];
    const sums = await this.db.tx.setLog.groupBy({
      by: ['workoutLogId'],
      where: {
        workoutLogId: { in: rows.map((row) => row.id) },
        localDate: {
          in: [...new Set(rows.map((row) => row.localDate.getTime()))].map((t) => new Date(t)),
        },
        status: 'ACTIVE',
      },
      _sum: { tonnageKg: true },
      _count: { _all: true },
    });
    const byWorkout = new Map(sums.map((sum) => [sum.workoutLogId, sum]));
    return rows.map((row) => {
      const sum = byWorkout.get(row.id);
      return {
        id: row.id,
        clientId: row.clientId,
        localDate: isoDate(row.localDate),
        sessionId: row.sessionId,
        outcome: row.outcome as WorkoutOutcome,
        durationMinutes:
          row.startedAt && row.finishedAt
            ? Math.round((row.finishedAt.getTime() - row.startedAt.getTime()) / MS_PER_MINUTE)
            : null,
        sessionRpe: num(row.sessionRpe),
        tonnageKg: Number(sum?._sum.tonnageKg ?? 0),
        setCount: sum?._count._all ?? 0,
        status: row.status as RecordStatus,
      };
    });
  }

  async daySets(patientId: string, localDate: string): Promise<readonly StoredSetLog[]> {
    const rows = await this.db.tx.setLog.findMany({
      where: { patientId, localDate: asDate(localDate) },
      select: SET,
      orderBy: [{ createdAt: 'asc' }, { setNo: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toSet);
  }

  async setLog(id: string): Promise<StoredSetLog | null> {
    const row = await this.db.tx.setLog.findFirst({ where: { id }, select: SET });
    return row ? toSet(row) : null;
  }

  async dayAdjustments(patientId: string, localDate: string): Promise<readonly StoredAdjustment[]> {
    const rows = await this.db.tx.logAdjustment.findMany({
      where: { patientId, targetLocalDate: asDate(localDate) },
      select: ADJUSTMENT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAdjustment);
  }

  async insertAdjustment(row: NewAdjustment): Promise<void> {
    await this.db.tx.logAdjustment.create({
      data: {
        id: row.id,
        organizationId: row.organizationId,
        patientId: row.patientId,
        targetType: row.targetType,
        targetId: row.targetId,
        targetLocalDate: asDate(row.targetLocalDate),
        action: row.action,
        // Excluir no lleva valores: el campo queda en NULL (log_adjustment_values_check).
        ...(row.correctedValues === null
          ? {}
          : { correctedValues: JSON.parse(JSON.stringify(row.correctedValues)) as object }),
        reason: row.reason,
        authorMemberId: row.authorMemberId,
      },
    });
  }

  async adjustment(id: string): Promise<StoredAdjustment | null> {
    const row = await this.db.tx.logAdjustment.findFirst({ where: { id }, select: ADJUSTMENT });
    return row ? toAdjustment(row) : null;
  }

  async unreadNotes(patientId: string, limit: number): Promise<readonly StoredNote[]> {
    const rows = await this.db.tx.noteLog.findMany({
      where: { patientId, readAt: null },
      select: NOTE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toNote);
  }

  async markNotesRead(
    patientId: string,
    noteIds: readonly string[],
    readBy: string,
    at: Date,
  ): Promise<readonly { readonly id: string; readonly localDate: string }[]> {
    const unread = await this.db.tx.noteLog.findMany({
      where: { patientId, id: { in: [...noteIds] }, readAt: null },
      select: { id: true, localDate: true },
    });
    for (const note of unread) {
      await this.db.tx.noteLog.updateMany({
        where: { id: note.id, localDate: note.localDate, readAt: null },
        data: { readAt: at, readBy },
      });
    }
    return unread.map((note) => ({ id: note.id, localDate: isoDate(note.localDate) }));
  }

  /** El plan vigente, desde su validFrom (RN-E14): effective_from es de la fila, que comparten el plan y el programa. */
  async activeNutrition(patientId: string): Promise<ActiveSnapshot | null> {
    const row = await this.db.tx.activePlanView.findUnique({
      where: { patientId },
      select: { nutritionPlanId: true, nutritionSnapshot: true },
    });
    const effectiveFrom = snapshotDate(row?.nutritionSnapshot, 'validFrom');
    return row?.nutritionPlanId && effectiveFrom
      ? { id: row.nutritionPlanId, effectiveFrom, snapshot: row.nutritionSnapshot }
      : null;
  }

  /** El programa vigente, desde su primer día (07 §8). */
  async activeTraining(patientId: string): Promise<ActiveSnapshot | null> {
    const row = await this.db.tx.activePlanView.findUnique({
      where: { patientId },
      select: { trainingProgramId: true, trainingSnapshot: true },
    });
    const effectiveFrom = snapshotDate(row?.trainingSnapshot, 'startDate');
    return row?.trainingProgramId && effectiveFrom
      ? { id: row.trainingProgramId, effectiveFrom, snapshot: row.trainingSnapshot }
      : null;
  }

  async dayTarget(patientId: string, localDate: string): Promise<DayTargetRow | null> {
    const row = await this.db.tx.dailyTarget.findUnique({
      where: { patientId_localDate: { patientId, localDate: asDate(localDate) } },
      select: { kcal: true, choG: true, proteinG: true, fatG: true, waterMl: true, dayKind: true },
    });
    if (
      !row ||
      row.kcal === null ||
      row.choG === null ||
      row.proteinG === null ||
      row.fatG === null
    ) {
      return null;
    }
    return {
      kcal: Number(row.kcal),
      choG: Number(row.choG),
      proteinG: Number(row.proteinG),
      fatG: Number(row.fatG),
      waterMl: row.waterMl,
      dayKind: row.dayKind === 'TRAINING' || row.dayKind === 'REST' ? row.dayKind : null,
    };
  }
}
