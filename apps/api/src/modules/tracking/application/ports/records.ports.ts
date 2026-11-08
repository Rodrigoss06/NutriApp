import type { FoodLogDraft } from '../../domain/records.js';

export type RecordStatus = 'ACTIVE' | 'VOIDED';

export interface StoredFoodLog {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: string;
  readonly loggedAt: Date;
  readonly mealSlotCode: string;
  readonly planId: string | null;
  readonly itemType: FoodLogDraft['itemType'];
  readonly itemName: string;
  readonly exchangeGroupCode: string | null;
  readonly servings: number | null;
  readonly grams: number | null;
  readonly householdText: string | null;
  readonly kcal: number | null;
  readonly choG: number | null;
  readonly proteinG: number | null;
  readonly fatG: number | null;
  readonly inPlan: boolean;
  readonly status: RecordStatus;
}

export interface StoredHydrationLog {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: string;
  readonly loggedAt: Date;
  readonly volumeMl: number;
  readonly status: RecordStatus;
}

export interface StoredNote {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: string;
  readonly body: string;
  readonly createdAt: Date;
  /** Cuándo la abrió alguien del equipo (RN-G13); sin abrir, null. */
  readonly readAt: Date | null;
}

export interface StoredMetric {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: string;
  readonly metricCode: string;
  readonly value: number;
  readonly status: RecordStatus;
}

/** Lo común a todo registro nuevo: su paciente, su día local (RN-G04) y el clientId del celular (RN-G08). */
export interface NewRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly localDate: string;
  readonly clientId: string;
}

export interface NewFoodLog extends NewRecord {
  readonly loggedAt: Date;
  readonly planId: string | null;
  readonly createdBy: string;
  readonly draft: FoodLogDraft;
}

/** Lo que el paciente anota en su registro diario (RN-G11, 07 §9); lo que no anota queda en null. */
export interface CheckinFields {
  readonly sessionMinutes: number | null;
  readonly sessionRpe: number | null;
  readonly sleepHours: number | null;
  readonly fatigue: number | null;
  readonly soreness: number | null;
  readonly stress: number | null;
  readonly motivation: number | null;
  readonly menstrualSymptoms: number | null;
  readonly nutritionCompliancePct: number | null;
  readonly carbsAroundTrainingG: number | null;
  readonly performancePlanned: number | null;
  readonly performanceActual: number | null;
  readonly restingHrBpm: number | null;
  readonly hrvMs: number | null;
  readonly steps: number | null;
  readonly activeKcal: number | null;
}

export type Indication = 'GREEN' | 'YELLOW' | 'RED' | 'NO_DATA';
export type ReadinessComponentCode = 'sleep' | 'heartRate' | 'hrv' | 'subjective';

/** La recuperación e indicación de un registro diario, con su método (RN-G14, RN-G15, RN-D01). */
export interface StoredReadiness {
  readonly id: string;
  readonly indication: Indication;
  readonly readinessScore: number | null;
  readonly components: Readonly<Record<ReadinessComponentCode, number>>;
  readonly neutralComponents: readonly ReadinessComponentCode[];
  readonly srpeLoad: number | null;
  readonly performancePct: number | null;
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly status: 'CURRENT' | 'SUPERSEDED';
}

export interface StoredCheckin extends CheckinFields {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: string;
  readonly status: RecordStatus;
  readonly readiness: StoredReadiness | null;
}

export interface NewCheckin extends NewRecord, CheckinFields {
  readonly programId: string | null;
  readonly weekNo: number | null;
  readonly sessionId: string | null;
}

export interface NewReadiness {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly localDate: string;
  readonly checkinId: string;
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly thresholdId: string;
  readonly inputs: unknown;
  /** SHA-256 de los insumos, en hexadecimal, como lo da el motor (RN-D01). */
  readonly inputsHash: string;
  readonly srpeLoad: number | null;
  readonly performancePct: number | null;
  readonly readinessScore: number | null;
  readonly components: Readonly<Record<ReadinessComponentCode, number>>;
  readonly neutralComponents: readonly ReadinessComponentCode[];
  readonly indication: Indication;
  readonly computedAt: Date;
}

/** La línea base del perfil vigente y el umbral vigente ese día (app.readiness_basis): lo que el paciente no lee directo. */
export interface ReadinessBasis {
  readonly thresholdId: string;
  readonly baseline: {
    readonly sleepTargetHours: number | null;
    readonly restingHrBpm: number | null;
    readonly hrvMs: number | null;
  };
  readonly thresholds: {
    readonly neutralScore: number;
    readonly readinessGreenMin: number;
    readonly readinessRedBelow: number;
    readonly performanceMinPct: number;
  };
}

export type WorkoutOutcome = 'COMPLETED' | 'PARTIAL' | 'SKIPPED';

/** Una serie hecha, con el nombre de su ejercicio y sus músculos congelados (RN-F06). */
export interface NewSetLog {
  readonly id: string;
  readonly clientId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly muscleContributions: readonly { readonly muscle: string; readonly weight: number }[];
  readonly setNo: number;
  readonly isWarmup: boolean;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly rir: number | null;
  readonly rpe: number | null;
  readonly durationSeconds: number | null;
  readonly distanceM: number | null;
  readonly met: number | null;
  readonly stimulus: number | null;
  readonly fatigue: number | null;
}

export interface NewWorkout extends NewRecord {
  readonly programId: string;
  readonly sessionId: string | null;
  readonly mesocycleId: string | null;
  readonly weekNo: number | null;
  readonly isDeload: boolean;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly outcome: WorkoutOutcome;
  readonly sessionRpe: number | null;
  readonly stimulus: number | null;
  readonly fatigue: number | null;
  readonly notes: string | null;
  readonly sets: readonly NewSetLog[];
}

export interface StoredWorkout {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: string;
  readonly sessionId: string | null;
  readonly outcome: WorkoutOutcome;
  readonly durationMinutes: number | null;
  readonly sessionRpe: number | null;
  /** Peso × repeticiones de sus series efectivas vigentes (RN-F03). */
  readonly tonnageKg: number;
  readonly setCount: number;
  readonly status: RecordStatus;
}

export interface StoredSetLog {
  readonly id: string;
  readonly workoutLogId: string;
  readonly localDate: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly setNo: number;
  readonly isWarmup: boolean;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly rir: number | null;
  readonly rpe: number | null;
  readonly durationSeconds: number | null;
  readonly distanceM: number | null;
  readonly tonnageKg: number;
  readonly status: RecordStatus;
}

export type AdjustmentTarget = 'FOOD' | 'HYDRATION' | 'WORKOUT' | 'SET' | 'CHECKIN' | 'METRIC';

/** Un ajuste del profesional (RN-G02): el registro, qué hizo, lo corregido, su motivo y su autor. */
export interface StoredAdjustment {
  readonly id: string;
  readonly targetType: AdjustmentTarget;
  readonly targetId: string;
  readonly targetLocalDate: string;
  readonly action: 'EXCLUDE' | 'CORRECT';
  readonly correctedValues: Readonly<Record<string, number | null>> | null;
  readonly reason: string;
  readonly authorMemberId: string;
  readonly createdAt: Date;
}

export interface NewAdjustment extends Omit<StoredAdjustment, 'createdAt'> {
  readonly organizationId: string;
  readonly patientId: string;
}

/** El plan o el programa vigente del paciente (tracking.active_plan_view), con su snapshot (RN-E15, RN-F12). */
export interface ActiveSnapshot {
  readonly id: string;
  readonly effectiveFrom: string;
  readonly snapshot: unknown;
}

export interface DayTargetRow {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
  readonly waterMl: number | null;
  /** El tipo del día según el programa vigente (07 §8); sin programa, null. */
  readonly dayKind: 'TRAINING' | 'REST' | null;
}

/**
 * Los registros del paciente (05.2, tracking), con la transacción y la RLS de quien llama: el paciente solo ve y escribe lo suyo
 * (RN-G01). Insertar no duplica un clientId que ya está (RN-G08); anular solo cambia el estado (RN-G12).
 */
export interface RecordStore {
  insertFoodLogs(rows: readonly NewFoodLog[]): Promise<void>;
  foodLogsByClientIds(
    patientId: string,
    localDate: string,
    clientIds: readonly string[],
  ): Promise<readonly StoredFoodLog[]>;
  foodLog(id: string): Promise<StoredFoodLog | null>;
  voidFoodLog(id: string, localDate: string, replacedById: string | null): Promise<void>;
  dayFoodLogs(patientId: string, localDate: string): Promise<readonly StoredFoodLog[]>;

  insertHydration(
    row: NewRecord & { readonly loggedAt: Date; readonly volumeMl: number },
  ): Promise<void>;
  hydrationByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredHydrationLog | null>;
  hydrationLog(id: string): Promise<StoredHydrationLog | null>;
  voidHydration(id: string, localDate: string): Promise<void>;
  dayHydration(patientId: string, localDate: string): Promise<readonly StoredHydrationLog[]>;

  insertNote(row: NewRecord & { readonly body: string }): Promise<void>;
  noteByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredNote | null>;
  dayNotes(patientId: string, localDate: string): Promise<readonly StoredNote[]>;

  insertMetric(
    row: NewRecord & {
      readonly metricCode: string;
      readonly value: number;
      readonly measuredAt: Date;
    },
  ): Promise<void>;
  metricByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredMetric | null>;
  metricLog(id: string): Promise<StoredMetric | null>;
  voidMetric(id: string, localDate: string): Promise<void>;
  dayMetrics(patientId: string, localDate: string): Promise<readonly StoredMetric[]>;
  /** El rango de una métrica de tracking.metric_definition; null si no existe o no está activa. */
  metricRange(
    code: string,
  ): Promise<{ readonly min: number | null; readonly max: number | null } | null>;

  insertCheckin(row: NewCheckin): Promise<void>;
  checkinByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredCheckin | null>;
  checkin(id: string): Promise<StoredCheckin | null>;
  /** El registro diario vigente de ese día (uno por día, RN-G11). */
  activeCheckin(patientId: string, localDate: string): Promise<StoredCheckin | null>;
  /** Anula el registro diario y deja su recuperación SUPERSEDED (RN-G12). */
  voidCheckin(id: string, localDate: string): Promise<void>;
  insertReadiness(row: NewReadiness): Promise<void>;
  /** Sin umbral vigente, null. Solo la sesión del paciente lo lee (app.readiness_basis). */
  readinessBasis(localDate: string): Promise<ReadinessBasis | null>;

  /** El entreno y sus series, en la misma transacción. */
  insertWorkout(row: NewWorkout): Promise<void>;
  workoutByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredWorkout | null>;
  workout(id: string): Promise<StoredWorkout | null>;
  dayWorkouts(patientId: string, localDate: string): Promise<readonly StoredWorkout[]>;
  /** Anula el entreno y sus series (RN-G12). */
  voidWorkout(id: string, localDate: string): Promise<void>;

  /** Las series de los entrenos de un día, vigentes o no: el profesional ve y ajusta cada una (RN-G01). */
  daySets(patientId: string, localDate: string): Promise<readonly StoredSetLog[]>;
  setLog(id: string): Promise<StoredSetLog | null>;
  /** Los ajustes de los registros de un día, del más antiguo al más reciente (RN-G02). */
  dayAdjustments(patientId: string, localDate: string): Promise<readonly StoredAdjustment[]>;
  insertAdjustment(row: NewAdjustment): Promise<void>;
  adjustment(id: string): Promise<StoredAdjustment | null>;
  /** Las notas del paciente que nadie del equipo abrió todavía, de la más antigua a la más nueva (RN-G13). */
  unreadNotes(patientId: string, limit: number): Promise<readonly StoredNote[]>;
  /** Marca leídas las notas sin leer de esa lista; devuelve las que marcó. */
  markNotesRead(
    patientId: string,
    noteIds: readonly string[],
    readBy: string,
    at: Date,
  ): Promise<readonly { readonly id: string; readonly localDate: string }[]>;

  activeNutrition(patientId: string): Promise<ActiveSnapshot | null>;
  activeTraining(patientId: string): Promise<ActiveSnapshot | null>;
  dayTarget(patientId: string, localDate: string): Promise<DayTargetRow | null>;
}

export const RECORD_STORE = Symbol.for('nutricoach.tracking.RecordStore');
