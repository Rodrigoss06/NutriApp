import { Inject, Injectable } from '@nestjs/common';
import { dayFacts, type DayFacts } from '../domain/day-facts.js';
import {
  FACTS_STORE,
  type ActivePlans,
  type FactsStore,
  type OverviewFacts,
} from './ports/facts.ports.js';

/**
 * Lo que tracking ofrece a otros contextos (02 §3): los hechos de cada día del paciente para la analítica (P14), con el ajuste
 * más reciente del profesional ya aplicado (RN-G02) y la meta del día (RN-G03). Corre en la transacción de quien llama, con su
 * RLS: en el worker y en la CLI, SYSTEM con la organización.
 */
@Injectable()
export class TrackingApi {
  constructor(@Inject(FACTS_STORE) private readonly facts: FactsStore) {}

  /** Los días del rango con meta o con algún registro, en orden. */
  async dailyFacts(patientId: string, from: string, to: string): Promise<readonly DayFacts[]> {
    return dayFacts(await this.facts.between(patientId, from, to));
  }

  /** El primer y el último día con meta o con algún registro; null si el paciente no tiene nada. */
  span(patientId: string): Promise<{ readonly from: string; readonly to: string } | null> {
    return this.facts.span(patientId);
  }

  /** Los programas de los entrenos del rango, también de los anulados. */
  programIds(patientId: string, from: string, to: string): Promise<readonly string[]> {
    return this.facts.programIds(patientId, from, to);
  }

  /** El programa vigente del paciente según la copia de tracking (active_plan_view); null si no tiene. */
  activeProgramId(patientId: string): Promise<string | null> {
    return this.facts.activeProgramId(patientId);
  }

  /** El plan y el programa vigentes del paciente, los que ve en su app: las fichas de su app salen de ellos (ADR-095). */
  activePlans(patientId: string): Promise<ActivePlans> {
    return this.facts.activePlans(patientId);
  }

  /** Lo del paciente que usa el panel del profesional para sus alertas (RF-34): último registro, notas sin leer y recuperación. */
  overviewFacts(patientId: string): Promise<OverviewFacts> {
    return this.facts.overview(patientId);
  }

  /**
   * Los pacientes de la organización del contexto con meta desde ese día: los que el trabajo de cada hora completa con sus días sin
   * registros; los días con registros los recalcula su evento.
   */
  patientIdsWithTargets(since: string): Promise<readonly string[]> {
    return this.facts.patientIdsWithTargets(since);
  }
}
