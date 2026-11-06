import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../clinical/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { addDays } from '../domain/diet-weeks.js';
import { DailyProjection } from './daily-projection.js';
import { localDateIn } from './local-date.js';
import { TrainingProjection } from './training-projection.js';

const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

/**
 * Cada hora en el worker: el resumen de ayer y de hoy de cada paciente con actividad reciente, en su fecha local (RN-G04), y las
 * semanas de su programa vigente. Así un día con meta y sin registros también tiene su fila (cuenta como un día con meta para la
 * adherencia) y una semana sin entrenos queda con lo programado y nada hecho. Idempotente.
 */
@Injectable()
export class DailyRefresh {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(DailyProjection) private readonly projection: DailyProjection,
    @Inject(TrainingProjection) private readonly training: TrainingProjection,
  ) {}

  /** Los pacientes recalculados. */
  async execute(): Promise<number> {
    const now = this.clock.now();
    const since = addDays(now.toISOString().slice(0, 10), -2);
    const organizations = await this.uow.query(platformContext, () =>
      this.tenancy.organizationIds(),
    );
    let refreshed = 0;
    for (const organizationId of organizations) {
      const ids = await this.uow.run(systemContext(organizationId), () =>
        this.tracking.patientIds(since),
      );
      for (const patientId of ids) {
        const done = await this.uow.run(systemContext(organizationId), async () => {
          const patient = await this.clinical.patientRef(patientId);
          if (!patient || patient.status === 'ARCHIVED') return false;
          const today = localDateIn(now, patient.timezone);
          await this.projection.refresh(organizationId, patientId, addDays(today, -1), today);
          await this.training.refreshForRange(organizationId, patientId, addDays(today, -1), today);
          return true;
        });
        if (done) refreshed += 1;
      }
    }
    return refreshed;
  }
}
