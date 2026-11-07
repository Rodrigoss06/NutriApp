import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { TenancyApi } from '../../tenancy/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { addDays } from '../domain/diet-weeks.js';
import { OverviewProjection } from './overview-projection.js';

const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

/**
 * Los pacientes que el trabajo de cada hora recalcula en el panel: los que tienen metas o registros en los últimos 35 días. Cubre
 * la ventana de adherencia de 30 días; un paciente sin nada en más tiempo ya tiene su alerta de «sin registros», que el paso del
 * tiempo no apaga.
 */
const ACTIVE_WINDOW_DAYS = 35;

/**
 * Cada hora en el worker (RF-34, ADR-093): recalcula el panel de los pacientes activos, porque varias alertas cambian con el paso
 * del tiempo (días sin registro, el semáforo de ayer, la semana que terminó) aunque no llegue ningún evento. Idempotente.
 */
@Injectable()
export class OverviewRefresh {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(OverviewProjection) private readonly overview: OverviewProjection,
  ) {}

  /** Los pacientes recalculados. */
  async execute(): Promise<number> {
    const since = addDays(this.clock.now().toISOString().slice(0, 10), -ACTIVE_WINDOW_DAYS);
    const organizations = await this.uow.query(platformContext, () =>
      this.tenancy.organizationIds(),
    );
    let refreshed = 0;
    for (const organizationId of organizations) {
      const ids = await this.uow.run(systemContext(organizationId), () =>
        this.tracking.patientIds(since),
      );
      for (const patientId of ids) {
        await this.uow.run(systemContext(organizationId), () =>
          this.overview.refresh(organizationId, patientId),
        );
        refreshed += 1;
      }
    }
    return refreshed;
  }
}
