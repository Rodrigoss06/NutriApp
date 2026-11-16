import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import {
  overviewPatientsQuerySchema,
  overviewQuerySchema,
  type OverviewPatient,
  type OverviewPatientsResponse,
  type OverviewResponse,
} from '@nutricoach/contracts';
import {
  parseBody,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import type { OverviewRow } from '../../../application/ports/analytics.ports.js';
import { OverviewQueries } from '../../../application/queries/overview.queries.js';

function organizationContext(request: ContextualRequest) {
  const context = request.securityContext;
  if (!context?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return context;
}

function overviewPatient(row: OverviewRow): OverviewPatient {
  return {
    patientId: row.patientId,
    alerts: [...row.alerts],
    lastLogDate: row.lastLogDate,
    adherence7dPct: row.adherence7dPct,
    adherence30dPct: row.adherence30dPct,
    unreadNotes: row.unreadNotes,
    lastEvaluationAt: row.lastEvaluationAt?.toISOString() ?? null,
    lastWeightKg: row.lastWeightKg,
    nextAppointmentAt: row.nextAppointmentAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * El panel del profesional con sus alertas (RF-34, ADR-093): GET /api/v1/analytics/overview; y la fila de unos pacientes, con
 * alertas o sin ellas, para el tablero y el resumen del expediente (ADR-137): GET /api/v1/analytics/overview/patients.
 */
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
    const context = organizationContext(request);
    const { alert, limit } = parseBody(overviewQuerySchema, query);
    const page = await this.queries.page(context, alert ?? null, limit);
    return { counts: page.counts, total: page.total, patients: page.rows.map(overviewPatient) };
  }

  @Get('patients')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async patients(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<OverviewPatientsResponse> {
    const context = organizationContext(request);
    const { ids } = parseBody(overviewPatientsQuerySchema, query);
    const rows = await this.queries.rows(context, ids);
    return { patients: rows.map(overviewPatient) };
  }
}
