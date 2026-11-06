import { Inject, Injectable } from '@nestjs/common';
import {
  systemContext,
  UNIT_OF_WORK,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { TenancyApi } from '../../tenancy/index.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from './ports/weekly-review.ports.js';
import { WeeklyReviewService } from './weekly-review.service.js';

/** Contexto de plataforma para listar las organizaciones: la RLS de tenancy se lo permite a PLATFORM_ADMIN. */
const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

/**
 * Cada hora en el worker: el control de las semanas que ya cerraron en la fecha local de cada paciente con un programa publicado
 * (07 §10). Idempotente: una semana con el mismo registro no cambia. Una transacción por programa, como SYSTEM de su organización.
 */
@Injectable()
export class WeeklyReviewsHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(WEEKLY_REVIEW_STORE) private readonly store: WeeklyReviewStore,
    @Inject(WeeklyReviewService) private readonly reviews: WeeklyReviewService,
  ) {}

  async execute(): Promise<number> {
    const organizations = await this.uow.query(platformContext, () =>
      this.tenancy.organizationIds(),
    );
    let written = 0;
    for (const organizationId of organizations) {
      const programs = await this.uow.run(systemContext(organizationId), () =>
        this.store.publishedPrograms(),
      );
      for (const program of programs) {
        written += await this.uow.run(systemContext(organizationId), () =>
          this.reviews.reviewProgram(organizationId, program.programId),
        );
      }
    }
    return written;
  }
}
