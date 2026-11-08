import { Inject, Injectable } from '@nestjs/common';
import {
  systemContext,
  UNIT_OF_WORK,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import { OverviewProjection } from './overview-projection.js';

const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

/**
 * Cada hora en el worker (RF-34, ADR-093): recalcula el panel de cada paciente de cada organización, porque varias alertas cambian con
 * el paso del tiempo (días sin registro, el semáforo de ayer, la semana que terminó) aunque no llegue ningún evento. Recorre los
 * pacientes de clinical y no los registros: buscar quién registró hace poco recorría cientos de miles de filas con la RLS fila por
 * fila y pasaba los 5 s de la transacción con 500 pacientes (ADR-096). Cada paciente va en su transacción. Idempotente.
 */
@Injectable()
export class OverviewRefresh {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(OverviewProjection) private readonly overview: OverviewProjection,
  ) {}

  /** Los pacientes recalculados. */
  async execute(): Promise<number> {
    const organizations = await this.uow.query(platformContext, () =>
      this.tenancy.organizationIds(),
    );
    let refreshed = 0;
    for (const organizationId of organizations) {
      const ids = await this.uow.query(systemContext(organizationId), () =>
        this.clinical.patientIds(),
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
