import type { DailySummary } from '../../domain/daily-summary.js';
import type { OneRmPoint } from '../../domain/one-rm.js';

/** Un grupo muscular en una semana del macrociclo (05.3 `analytics.patient_weekly_muscle_volume`). */
export interface WeeklyMuscleRow {
  readonly weekStart: string;
  readonly muscleCode: string;
  /** La última versión publicada de la línea del programa. */
  readonly programId: string | null;
  readonly mesocycleId: string | null;
  readonly weekNo: number | null;
  readonly isDeload: boolean | null;
  readonly fractionalSetsDone: number;
  readonly fractionalSetsPlanned: number | null;
  readonly tonnageKg: number | null;
  readonly avgRpe: number | null;
  readonly avgStimulus: number | null;
  readonly avgFatigue: number | null;
  readonly sfr: number | null;
}

/** Los read models de la analítica (05.3): se reconstruyen desde las tablas de origen y nunca son la fuente de verdad. */
export interface AnalyticsStore {
  /** Reemplaza el resumen de esos días: borra lo que había en el rango y escribe estas filas. */
  replaceDailySummaries(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
    rows: readonly DailySummary[],
  ): Promise<void>;
  /** Borra todo el resumen del paciente, para reconstruirlo. */
  deleteDailySummaries(patientId: string): Promise<void>;
  /** El resumen de un rango, en orden; con la RLS del contexto (RN-A05). */
  dailySummaries(patientId: string, from: string, to: string): Promise<readonly DailySummary[]>;
  /** Reemplaza las semanas que empiezan dentro del rango. */
  replaceWeeklyVolume(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
    rows: readonly WeeklyMuscleRow[],
  ): Promise<void>;
  deleteWeeklyVolume(patientId: string): Promise<void>;
  /** Las semanas que empiezan dentro del rango, en orden. */
  weeklyVolume(patientId: string, from: string, to: string): Promise<readonly WeeklyMuscleRow[]>;
  /** Reemplaza los 1RM de esos días. */
  replaceOneRm(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
    points: readonly OneRmPoint[],
  ): Promise<void>;
  deleteOneRm(patientId: string): Promise<void>;
  /** Los 1RM del rango, por ejercicio y en orden de fecha. */
  oneRmSeries(patientId: string, from: string, to: string): Promise<readonly OneRmPoint[]>;
}

export const ANALYTICS_STORE = Symbol('ANALYTICS_STORE');
