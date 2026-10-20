import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  recalculateEvaluationSchema,
  setMethodPreferenceSchema,
  type EvaluationComparisonResponse,
  type EvaluationResultsResponse,
  type OrganizationMethodPreferencesResponse,
  type PatientMethodPreferencesResponse,
  type RecalculateResponse,
  type TargetWeightResponse,
} from '@nutricoach/contracts';
import { isErr } from '@nutricoach/shared-kernel';
import {
  parseBody,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { PATIENT_NOT_FOUND } from '../../../../clinical/index.js';
import { CalculationCommands } from '../../../application/commands/calculation.commands.js';
import {
  ResultsQueries,
  type ComparisonView,
  type PreferencesView,
  type ResultsView,
} from '../../../application/queries/results.queries.js';
import { EVALUATION_NOT_FOUND } from '../../../domain/assessment-rules.js';
import type { ReferenceScale } from '../../../domain/interpretation.js';
import type { EvaluationRecord } from '../../../application/ports/assessment.ports.js';
import { contextOf, problem } from './evaluation.controller.js';

const notFound = () =>
  new ProblemException(404, { title: 'No encontrado.', code: EVALUATION_NOT_FOUND.code });

const resultsOf = (view: ResultsView): EvaluationResultsResponse => ({
  evaluationId: view.evaluationId,
  status: view.status,
  results: view.results.map((r) => ({
    id: r.id,
    methodCode: r.methodCode,
    methodVersion: r.methodVersion,
    engineVersion: r.engineVersion,
    inputsHash: r.inputsHash,
    status: r.status,
    supersededBy: r.supersededBy,
    measuredAt: r.measuredAt.toISOString(),
    computedAt: r.computedAt.toISOString(),
    warnings: r.warnings.map((w) => ({ ...w })),
    metrics: r.metrics.map((m) => ({
      metricCode:
        m.metricCode as EvaluationResultsResponse['results'][number]['metrics'][number]['metricCode'],
      value: m.value,
      unit: m.unit,
      methodCode: m.methodCode,
      zScore: m.zScore,
      interpretation: m.interpretation,
      interpretationNote: m.interpretationNote,
      referenceScale: scaleOf(m.referenceScale),
    })),
    principalFor: [...r.principalFor],
  })),
  unavailable: view.unavailable.map((u) => ({
    methodCode: u.methodCode,
    reason: u.reason,
    missingSites: [...u.missingSites],
    issues: u.issues.map((issue) => ({ ...issue })),
  })),
  populationNote: view.populationNote,
  siteInterpretations: view.siteInterpretations.map((s) => ({
    siteCode: s.siteCode,
    value: s.value,
    unit: s.unit,
    methodCode: 'CONSOLIDATE_ISAK',
    interpretation: s.interpretation,
    interpretationNote: s.interpretationNote,
    referenceScale: scaleOf(s.referenceScale),
  })),
});

const scaleOf = (scale: ReferenceScale | null) =>
  scale ? { source: scale.source, bands: scale.bands.map((band) => ({ ...band })) } : null;

const compared = (evaluation: EvaluationRecord) => ({
  id: evaluation.id,
  measuredAt: evaluation.measuredAt.toISOString(),
  evaluatorMemberId: evaluation.evaluatorMemberId,
  conditions: evaluation.conditions,
});

const comparisonOf = (view: ComparisonView): EvaluationComparisonResponse => ({
  current: compared(view.current),
  previous: view.previous ? compared(view.previous) : null,
  conditionDifferences: [...view.conditionDifferences],
  sites: view.sites.map((s) => ({ ...s })),
  skinfoldSum6: view.skinfoldSum6 ? { ...view.skinfoldSum6 } : null,
  metrics: view.metrics.map((m) => ({
    ...m,
    metricCode: m.metricCode as EvaluationComparisonResponse['metrics'][number]['metricCode'],
    unit: m.unit as EvaluationComparisonResponse['metrics'][number]['unit'],
  })),
});

const preferencesOf = (preferences: PreferencesView) =>
  (['FAT_PCT', 'MUSCLE', 'BONE', 'RMR', 'ONE_RM'] as const).map((purpose) => ({
    purpose,
    methodCode: preferences[purpose].methodCode,
    source: preferences[purpose].source,
  }));

/** Resultados de una evaluación (RF-15): con método e interpretación, recálculo explícito, comparación y peso objetivo. */
@Controller('evaluations/:evaluationId')
export class ResultsController {
  constructor(
    private readonly commands: CalculationCommands,
    private readonly queries: ResultsQueries,
  ) {}

  @Get('results')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async results(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
  ): Promise<EvaluationResultsResponse> {
    const view = await this.queries.results(contextOf(request), id);
    if (!view) throw notFound();
    return resultsOf(view);
  }

  /** RN-D08: recalcular es explícito; crea resultados nuevos y deja los anteriores como SUPERSEDED. */
  @Post('recalculate')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async recalculate(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<RecalculateResponse> {
    const context = contextOf(request);
    const { leeReferenceGroupCoefficient } = parseBody(recalculateEvaluationSchema, body ?? {});
    const result = await this.commands.recalculate(context, id, {
      referenceGroupCoefficient: leeReferenceGroupCoefficient,
    });
    if (isErr(result)) throw problem(result.error);
    const view = await this.queries.results(context, id);
    if (!view) throw notFound();
    return { ...resultsOf(view), ...result.value };
  }

  @Get('comparison')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async comparison(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Query('with') other: string | undefined,
  ): Promise<EvaluationComparisonResponse> {
    if (other !== undefined && !/^[0-9a-f-]{36}$/i.test(other)) throw notFound();
    const view = await this.queries.comparison(contextOf(request), id, other);
    if (!view) throw notFound();
    return comparisonOf(view);
  }

  @Get('target-weight')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async targetWeight(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Query('targetFatPct') raw: string | undefined,
  ): Promise<TargetWeightResponse> {
    const targetFatPct = Number(raw);
    if (!(targetFatPct > 0 && targetFatPct < 100)) {
      throw new ProblemException(400, {
        title: 'El % de grasa objetivo va entre 0 y 100.',
        code: 'NC-ASM-020',
      });
    }
    const view = await this.queries.targetWeight(contextOf(request), id, targetFatPct);
    if (!view) throw notFound();
    if (view === 'NO_FAT_FREE_MASS') {
      throw new ProblemException(422, {
        title: 'La evaluación no tiene masa libre de grasa del método principal de % de grasa.',
        code: 'NC-ASM-021',
        rule: 'RN-E06',
      });
    }
    return {
      methodCode: 'TARGET_WEIGHT_FAT_PCT',
      ...view,
      warnings: view.warnings.map((w) => ({ ...w })),
    };
  }
}

/** Métodos por población de la organización (RN-D05, RF-16): OWNER y ADMIN; la plataforma sale del motor. */
@Controller('organization/method-preferences')
export class OrganizationPreferencesController {
  constructor(
    private readonly commands: CalculationCommands,
    private readonly queries: ResultsQueries,
  ) {}

  @Get()
  @RequirePermission('organization.read')
  async list(@Req() request: ContextualRequest): Promise<OrganizationMethodPreferencesResponse> {
    const rows = await this.queries.organizationPreferences(contextOf(request));
    return {
      populations: rows.map((row) => ({
        population: row.population,
        preferences: preferencesOf(row.preferences),
      })),
    };
  }

  @Put(':population/:purpose')
  @RequirePermission('organization.update')
  async set(
    @Req() request: ContextualRequest,
    @Param('population') population: string,
    @Param('purpose') purpose: string,
    @Body() body: unknown,
  ): Promise<OrganizationMethodPreferencesResponse> {
    const { methodCode } = parseBody(setMethodPreferenceSchema, body);
    const result = await this.commands.setOrganizationPreference(
      contextOf(request),
      population,
      purpose,
      methodCode,
    );
    if (isErr(result)) throw problem(result.error);
    return this.list(request);
  }

  @Delete(':population/:purpose')
  @RequirePermission('organization.update')
  async remove(
    @Req() request: ContextualRequest,
    @Param('population') population: string,
    @Param('purpose') purpose: string,
  ): Promise<OrganizationMethodPreferencesResponse> {
    const result = await this.commands.setOrganizationPreference(
      contextOf(request),
      population,
      purpose,
      null,
    );
    if (isErr(result)) throw problem(result.error);
    return this.list(request);
  }
}

/** La elección de métodos de un paciente (RN-D05): su equipo con escritura; no recalcula nada (RN-D08). */
@Controller('patients/:patientId/method-preferences')
export class PatientPreferencesController {
  constructor(
    private readonly commands: CalculationCommands,
    private readonly queries: ResultsQueries,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<PatientMethodPreferencesResponse> {
    const view = await this.queries.patientPreferences(contextOf(request), patientId);
    if (!view) {
      throw new ProblemException(404, { title: 'No encontrado.', code: PATIENT_NOT_FOUND.code });
    }
    return { population: view.population, preferences: preferencesOf(view.preferences) };
  }

  @Put(':purpose')
  @RequirePermission('patients.write')
  async set(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('purpose') purpose: string,
    @Body() body: unknown,
  ): Promise<PatientMethodPreferencesResponse> {
    const { methodCode } = parseBody(setMethodPreferenceSchema, body);
    const result = await this.commands.setPatientPreference(
      contextOf(request),
      patientId,
      purpose,
      methodCode,
    );
    if (isErr(result)) throw problem(result.error);
    return this.list(request, patientId);
  }

  @Delete(':purpose')
  @RequirePermission('patients.write')
  async remove(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('purpose') purpose: string,
  ): Promise<PatientMethodPreferencesResponse> {
    const result = await this.commands.setPatientPreference(
      contextOf(request),
      patientId,
      purpose,
      null,
    );
    if (isErr(result)) throw problem(result.error);
    return this.list(request, patientId);
  }
}
