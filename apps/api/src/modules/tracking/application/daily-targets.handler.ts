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
import { localDate } from '../domain/active-plan.js';
import { TRACKING_STORE, type TrackingStore } from './ports/tracking.ports.js';

/** Contexto de plataforma para listar las organizaciones: la RLS de tenancy se lo permite a PLATFORM_ADMIN. */
const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

/**
 * Cada hora en el worker: a cada paciente con un plan vigente le crea la meta de su día local si aún no la tiene
 * (RN-G03, RN-G04). Nunca reescribe un día que ya tiene meta. Idempotente.
 */
@Injectable()
export class DailyTargetsHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRACKING_STORE) private readonly store: TrackingStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const organizations = await this.uow.query(platformContext, () =>
      this.tenancy.organizationIds(),
    );
    let created = 0;
    for (const organizationId of organizations) {
      created += await this.uow.run(systemContext(organizationId), async () => {
        let count = 0;
        for (const plan of await this.store.activeNutritionPlans()) {
          const patient = await this.clinical.patientRef(plan.patientId);
          if (!patient || patient.status === 'ARCHIVED') continue;
          const written = await this.store.setDailyTarget(
            {
              patientId: plan.patientId,
              organizationId,
              localDate: localDate(now, patient.timezone),
              planId: plan.planId,
              target: plan.target,
            },
            'KEEP',
          );
          if (written) count += 1;
        }
        return count;
      });
    }
    return created;
  }
}
