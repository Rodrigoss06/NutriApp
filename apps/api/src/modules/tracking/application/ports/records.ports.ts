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

  activeNutrition(patientId: string): Promise<ActiveSnapshot | null>;
  activeTraining(patientId: string): Promise<ActiveSnapshot | null>;
  dayTarget(patientId: string, localDate: string): Promise<DayTargetRow | null>;
}

export const RECORD_STORE = Symbol.for('nutricoach.tracking.RecordStore');
