import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { overviewQuerySchema, type OverviewResponse } from '@nutricoach/contracts';
import {
  parseBody,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { OverviewQueries } from '../../../application/queries/overview.queries.js';

/** El panel del profesional con sus alertas (RF-34, ADR-093): GET /api/v1/analytics/overview. */
@Controller('analytics/overview')
export class OverviewController {
  constructor(private readonly queries: OverviewQueries) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async page(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<OverviewResponse> {
    const context = request.securityContext;
    if (!context?.organizationId) {
      throw new ProblemException(403, {
        title: 'Elige con qué organización trabajas.',
        code: 'NC-TEN-011',
      });
    }
    const { alert, limit } = parseBody(overviewQuerySchema, query);
    const page = await this.queries.page(context, alert ?? null, limit);
    return {
      counts: page.counts,
      total: page.total,
      patients: page.rows.map((row) => ({
        patientId: row.patientId,
        alerts: [...row.alerts],
        lastLogDate: row.lastLogDate,
        adherence7dPct: row.adherence7dPct,
        adherence30dPct: row.adherence30dPct,
        unreadNotes: row.unreadNotes,
        lastEvaluationAt: row.lastEvaluationAt?.toISOString() ?? null,
        lastWeightKg: row.lastWeightKg,
        // La próxima cita llega con la agenda (P15).
        nextAppointmentAt: null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
