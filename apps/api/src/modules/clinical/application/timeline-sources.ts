import { Injectable } from '@nestjs/common';
import type { TimelineRecord } from './ports/clinical.ports.js';

/** Posición de la página: lo que va antes de este hecho, de lo más reciente a lo más antiguo. */
export interface TimelineCursor {
  readonly occurredAt: Date;
  readonly refId: string;
}

/**
 * Hechos de otro contexto para la línea de tiempo del expediente (RF-10): evaluaciones, prescripciones, planes. Corre
 * dentro de la transacción de la consulta de clinical, con su RLS. Ordena por (occurredAt, refId) descendente, igual
 * que la línea de tiempo, y devuelve como mucho `limit` hechos anteriores al cursor.
 */
export interface TimelineSource {
  entries(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineRecord[]>;
}

/**
 * Registro de fuentes: los contextos que usan a clinical se registran al iniciar (ClinicalApi), así clinical no
 * importa a quienes lo importan (sin ciclos, como PATIENT_ENROLLMENT en ADR-040).
 */
@Injectable()
export class TimelineSources {
  readonly #sources: TimelineSource[] = [];

  register(source: TimelineSource): void {
    this.#sources.push(source);
  }

  all(): readonly TimelineSource[] {
    return this.#sources;
  }
}

/** El mismo orden que el SQL de la línea de tiempo: instante y, a igual instante, el uuid de mayor a menor. */
export function newestFirst(a: TimelineRecord, b: TimelineRecord): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.refId === b.refId) return 0;
  return a.refId < b.refId ? 1 : -1;
}
