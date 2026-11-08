import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type OrganizationId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { addDays } from '../domain/diet-weeks.js';
import { DailyProjection } from './daily-projection.js';
import { OverviewProjection } from './overview-projection.js';
import { TrainingProjection } from './training-projection.js';
import { localDateIn } from './local-date.js';
import { ANALYTICS_STORE, type AnalyticsStore } from './ports/analytics.ports.js';

/** Contexto de plataforma para listar las organizaciones: la RLS de tenancy se lo permite a PLATFORM_ADMIN. */
const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

/** Los días por transacción al reconstruir un paciente (ADR-096). */
const REBUILD_CHUNK_DAYS = 120;

export interface RebuildReport {
  readonly patients: number;
  readonly days: number;
}

/**
 * Reconstrucción de la analítica desde las tablas de origen (P14, alcance 2): borra lo del paciente (resumen diario, 1RM y volumen
 * semanal) y lo vuelve a calcular con las mismas funciones que el consumidor, desde su primer día con meta o registros hasta hoy, y
 * su fila del panel. Como SYSTEM de su organización, por tramos (ADR-096).
 */
@Injectable()
export class AnalyticsRebuild {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(DailyProjection) private readonly projection: DailyProjection,
    @Inject(TrainingProjection) private readonly training: TrainingProjection,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
    @Inject(OverviewProjection) private readonly overview: OverviewProjection,
  ) {}

  /** Un paciente, en la organización donde exista; null si no existe en ninguna. */
  async patient(patientId: string): Promise<RebuildReport | null> {
    for (const organizationId of await this.#organizations()) {
      const days = await this.#rebuild(organizationId, patientId);
      if (days !== null) return { patients: 1, days };
    }
    return null;
  }

  /**
   * Todos los pacientes de todas las organizaciones, de clinical (sin leer los registros, ADR-096); `concurrency` pacientes a la vez,
   * cada uno con sus propias transacciones.
   */
  async all(concurrency = 1): Promise<RebuildReport> {
    let patients = 0;
    let days = 0;
    for (const organizationId of await this.#organizations()) {
      const ids = await this.uow.query(systemContext(organizationId), () =>
        this.clinical.patientIds(),
      );
      let next = 0;
      const worker = async (): Promise<void> => {
        for (let patientId = ids[next++]; patientId !== undefined; patientId = ids[next++]) {
          const written = await this.#rebuild(organizationId, patientId);
          if (written === null) continue;
          patients += 1;
          days += written;
        }
      };
      const workers = Math.max(1, Math.min(concurrency, ids.length));
      await Promise.all(Array.from({ length: workers }, worker));
    }
    return { patients, days };
  }

  #organizations(): Promise<readonly OrganizationId[]> {
    return this.uow.query(platformContext, () => this.tenancy.organizationIds());
  }

  /**
   * Los días escritos; null si el paciente no existe en esa organización. Borra lo del paciente y lo recalcula por tramos de
   * REBUILD_CHUNK_DAYS, cada uno en su transacción: con dos años de historia, una sola transacción se acercaba al límite de 5 s
   * (ADR-096). Los números no cambian: cada día y cada línea de programa se recalculan enteros.
   */
  async #rebuild(organizationId: OrganizationId, patientId: string): Promise<number | null> {
    const context = systemContext(organizationId);
    const range = await this.uow.run(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return null;
      await this.store.deleteDailySummaries(patientId);
      await this.store.deleteOneRm(patientId);
      await this.store.deleteWeeklyVolume(patientId);
      const span = await this.tracking.span(patientId);
      const today = localDateIn(this.clock.now(), patient.timezone);
      return { span, to: span && span.to > today ? span.to : today };
    });
    if (!range) return null;
    let days = 0;
    if (range.span) {
      for (let from = range.span.from; from <= range.to; from = addDays(from, REBUILD_CHUNK_DAYS)) {
        const chunkEnd = addDays(from, REBUILD_CHUNK_DAYS - 1);
        const until = chunkEnd < range.to ? chunkEnd : range.to;
        days += await this.uow.run(context, () =>
          this.projection.refresh(organizationId, patientId, from, until),
        );
        await this.uow.run(context, () =>
          this.training.refreshForRange(organizationId, patientId, from, until),
        );
      }
    }
    await this.uow.run(context, () => this.overview.refresh(organizationId, patientId));
    return days;
  }
}
