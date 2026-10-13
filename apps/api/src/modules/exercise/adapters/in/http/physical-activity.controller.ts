import { Controller, Get, Query, Req } from '@nestjs/common';
import type { PhysicalActivityListResponse } from '@nutricoach/contracts';
import {
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { ActivityQueries } from '../../../application/activity.queries.js';

/** GET /api/v1/physical-activities?q=correr: actividades con su MET (RN-E03), sin tildes. */
@Controller('physical-activities')
export class PhysicalActivityController {
  constructor(private readonly queries: ActivityQueries) {}

  @Get()
  @RequirePermission('patients.read')
  async search(
    @Req() request: ContextualRequest,
    @Query('q') text: string | undefined,
  ): Promise<PhysicalActivityListResponse> {
    const context = request.securityContext;
    if (!context?.organizationId) {
      throw new ProblemException(403, {
        title: 'Elige con qué organización trabajas.',
        code: 'NC-TEN-011',
      });
    }
    const activities = await this.queries.search(context, text?.slice(0, 80) ?? null);
    return { activities: activities.map((activity) => ({ ...activity })) };
  }
}
