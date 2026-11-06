import { Controller, Get, Header, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type {
  EvolutionPoint,
  EvolutionResponse,
  PatientEvolutionResponse,
} from '@nutricoach/contracts';
import type { SecurityContext } from '@nutricoach/shared-kernel';
import {
  PatientOnly,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { PATIENT_NOT_FOUND } from '../../../../clinical/index.js';
import {
  EvolutionQueries,
  type EvolutionView,
} from '../../../application/queries/evolution.queries.js';
import type { EvolutionSeries } from '../../../domain/evolution.js';
import { contextOf } from './evaluation.controller.js';

const seriesOf = (series: EvolutionSeries) => ({
  points: series.points.map((point): EvolutionPoint => ({
    evaluationId: point.evaluationId,
    localDate: point.localDate,
    value: point.value,
    change: point.change,
    mdc95: point.mdc95,
    significance: point.significance,
  })),
  overall: series.overall ? { ...series.overall } : null,
});

/** La respuesta de la evolución (RF-35): los códigos se validaron al guardarse; el contrato los nombra. */
export const evolutionOf = (view: EvolutionView): EvolutionResponse => ({
  evaluations: view.evaluations.map((evaluation) => ({
    ...evaluation,
    conditionDifferences: [
      ...evaluation.conditionDifferences,
    ] as EvolutionResponse['evaluations'][number]['conditionDifferences'],
  })),
  sites: view.sites.map((site) => ({
    siteCode: site.siteCode,
    name: site.name,
    family: site.family,
    unit: site.unit,
    ...seriesOf(site),
  })),
  skinfoldSum6: view.skinfoldSum6 ? seriesOf(view.skinfoldSum6) : null,
  metrics: view.metrics.map((metric) => ({
    metricCode: metric.metricCode as EvolutionResponse['metrics'][number]['metricCode'],
    methodCode: metric.methodCode,
    unit: metric.unit as EvolutionResponse['metrics'][number]['unit'],
    ...seriesOf(metric),
  })),
  bia: view.bia.map((reading) => ({
    device: reading.device,
    metric: reading.metric as EvolutionResponse['bia'][number]['metric'],
    deviceLabel: reading.deviceLabel,
    unit: reading.unit as EvolutionResponse['bia'][number]['unit'],
    ...seriesOf(reading),
  })),
});

/**
 * La evolución antropométrica del paciente para su equipo (RF-35): con `patients.read` y la RLS del equipo de atención
 * (RN-A05); fuera de él, 404. Leerla deja un READ en la auditoría (RN-B03).
 */
@Controller('patients/:patientId/evolution')
export class EvolutionController {
  constructor(private readonly queries: EvolutionQueries) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async evolution(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<EvolutionResponse> {
    const view = await this.queries.evolution(contextOf(request), patientId);
    if (!view) {
      throw new ProblemException(404, { title: 'No encontrado.', code: PATIENT_NOT_FOUND.code });
    }
    return evolutionOf(view);
  }
}

const patientContextOf = (request: ContextualRequest): SecurityContext => {
  const context = request.securityContext;
  if (context?.role !== 'PATIENT' || !context.patientId) {
    throw new ProblemException(403, {
      title: 'Esta sección es de la app del paciente.',
      code: 'NC-PLT-013',
    });
  }
  return context;
};

/** Progreso en la app del paciente (RF-30, ADR-091): lo suyo, desde su sesión; nunca envía su id. */
@Controller('me/evolution')
export class MeEvolutionController {
  constructor(private readonly queries: EvolutionQueries) {}

  @Get()
  @PatientOnly()
  @Header('Cache-Control', 'no-store')
  async evolution(@Req() request: ContextualRequest): Promise<PatientEvolutionResponse> {
    const view = await this.queries.patientEvolution(patientContextOf(request));
    return {
      evaluationCount: view.evaluationCount,
      items: view.items.map((item) => ({
        item: item.item,
        unit: item.unit,
        methodCode: item.methodCode,
        ...seriesOf(item),
      })),
    };
  }
}
