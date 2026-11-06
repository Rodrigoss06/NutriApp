import type { RawFacts } from '../../domain/day-facts.js';

/** Lo que tracking guarda de un paciente en un rango de días, para la analítica (P14). Corre con la RLS del contexto. */
export interface FactsStore {
  /** Los registros vigentes del rango (sin los anulados), sus ajustes y sus metas; sin aplicar los ajustes. */
  between(patientId: string, from: string, to: string): Promise<RawFacts>;
  /** El primer y el último día con meta o con algún registro del paciente; null si no tiene nada. */
  span(patientId: string): Promise<{ readonly from: string; readonly to: string } | null>;
  /** Los pacientes con meta o con algún registro desde ese día; sin día, todos los que tienen alguno. */
  patientIds(since: string | null): Promise<readonly string[]>;
  /** Los programas de los entrenos del rango, también de los anulados: anular uno cambia su semana (RN-G12). */
  programIds(patientId: string, from: string, to: string): Promise<readonly string[]>;
  /** El programa de la copia vigente (active_plan_view), sin bloquear la fila: sirve también en una lectura. */
  activeProgramId(patientId: string): Promise<string | null>;
}

export const FACTS_STORE = Symbol('FACTS_STORE');
