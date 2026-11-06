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
import { DailyProjection } from './daily-projection.js';
import { localDateIn } from './local-date.js';
import { ANALYTICS_STORE, type AnalyticsStore } from './ports/analytics.ports.js';

/** Contexto de plataforma para listar las organizaciones: la RLS de tenancy se lo permite a PLATFORM_ADMIN. */
const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

export interface RebuildReport {
  readonly patients: number;
  readonly days: number;
}

/**
 * Reconstrucción de la analítica desde las tablas de origen (P14, alcance 2): borra lo del paciente y lo vuelve a calcular con la
 * misma función que el consumidor, desde su primer día con meta o registros hasta hoy. Una transacción por paciente, como SYSTEM
 * de su organización.
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
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
  ) {}

  /** Un paciente, en la organización donde exista; null si no existe en ninguna. */
  async patient(patientId: string): Promise<RebuildReport | null> {
    for (const organizationId of await this.#organizations()) {
      const days = await this.#rebuild(organizationId, patientId);
      if (days !== null) return { patients: 1, days };
    }
    return null;
  }

  /** Todos los pacientes con meta o registros, de todas las organizaciones. */
  async all(): Promise<RebuildReport> {
    let patients = 0;
    let days = 0;
    for (const organizationId of await this.#organizations()) {
      const ids = await this.uow.run(systemContext(organizationId), () =>
        this.tracking.patientIds(null),
      );
      for (const patientId of ids) {
        const written = await this.#rebuild(organizationId, patientId);
        if (written === null) continue;
        patients += 1;
        days += written;
      }
    }
    return { patients, days };
  }

  #organizations(): Promise<readonly OrganizationId[]> {
    return this.uow.query(platformContext, () => this.tenancy.organizationIds());
  }

  /** Los días escritos; null si el paciente no existe en esa organización. */
  #rebuild(organizationId: OrganizationId, patientId: string): Promise<number | null> {
    return this.uow.run(systemContext(organizationId), async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return null;
      await this.store.deleteDailySummaries(patientId);
      const span = await this.tracking.span(patientId);
      if (!span) return 0;
      const today = localDateIn(this.clock.now(), patient.timezone);
      const to = span.to > today ? span.to : today;
      return this.projection.refresh(organizationId, patientId, span.from, to);
    });
  }
}
