import { Inject, Injectable } from '@nestjs/common';
import { dayFacts, type DayFacts } from '../domain/day-facts.js';
import { FACTS_STORE, type FactsStore } from './ports/facts.ports.js';

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

  /** Los pacientes de la organización del contexto con meta o con algún registro desde ese día (o desde siempre). */
  patientIds(since: string | null): Promise<readonly string[]> {
    return this.facts.patientIds(since);
  }
}
