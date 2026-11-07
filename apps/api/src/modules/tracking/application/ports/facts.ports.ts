import type { RawFacts } from '../../domain/day-facts.js';

/** Lo que el panel del profesional necesita de tracking para las alertas de un paciente (RF-34, ADR-093). */
export interface OverviewFacts {
  /** El último día con algún registro vigente: comida, agua, peso, registro diario, entreno o nota. */
  readonly lastRecordDate: string | null;
  /** El primer día con meta: desde ahí cuenta un paciente que nunca registró. */
  readonly firstTargetDate: string | null;
  /** Las notas del paciente que su equipo todavía no abrió (RN-G13). */
  readonly unreadNotes: number;
  /** El último registro diario vigente con la indicación de su recuperación (RN-G15). */
  readonly latestCheckin: {
    readonly localDate: string;
    readonly indication: 'GREEN' | 'YELLOW' | 'RED' | 'NO_DATA' | null;
  } | null;
}

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
  /** Lo del paciente que usa el panel del profesional (RF-34). */
  overview(patientId: string): Promise<OverviewFacts>;
}

export const FACTS_STORE = Symbol('FACTS_STORE');
