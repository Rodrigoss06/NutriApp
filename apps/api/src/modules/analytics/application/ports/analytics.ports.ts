import type { DailySummary } from '../../domain/daily-summary.js';

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
}

export const ANALYTICS_STORE = Symbol('ANALYTICS_STORE');
