import type { RawFacts } from '../../domain/day-facts.js';

/** El plan de alimentación y el programa vigentes del paciente, según la copia de tracking (active_plan_view). */
export interface ActivePlans {
  readonly nutritionPlanId: string | null;
  readonly trainingProgramId: string | null;
}

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
  /**
   * Los pacientes con meta desde ese día. Solo lee las metas (una fila por paciente y día): recorrer los registros con la RLS fila
   * por fila tardaba segundos con 500 pacientes (ADR-096).
   */
  patientIdsWithTargets(since: string): Promise<readonly string[]>;
  /** Los programas de los entrenos del rango, también de los anulados: anular uno cambia su semana (RN-G12). */
  programIds(patientId: string, from: string, to: string): Promise<readonly string[]>;
  /** El programa de la copia vigente (active_plan_view), sin bloquear la fila: sirve también en una lectura. */
  activeProgramId(patientId: string): Promise<string | null>;
  /** El plan y el programa de la copia vigente: lo que el paciente ve en su app. */
  activePlans(patientId: string): Promise<ActivePlans>;
  /** Lo del paciente que usa el panel del profesional (RF-34). */
  overview(patientId: string): Promise<OverviewFacts>;
}

export const FACTS_STORE = Symbol('FACTS_STORE');
