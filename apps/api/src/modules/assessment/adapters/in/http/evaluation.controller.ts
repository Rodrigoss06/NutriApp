import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  amendEvaluationSchema,
  createBiaReadingSchema,
  createEvaluationSchema,
  recordMeasurementSchema,
  updateEvaluationSchema,
  type EvaluationListResponse,
  type EvaluationResponse,
  type EvaluationSummary,
  type MeasurementSiteListResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { EvaluationCommands } from '../../../application/commands/evaluation.commands.js';
import {
  EvaluationQueries,
  type EvaluationSummaryView,
  type EvaluationView,
} from '../../../application/queries/evaluation.queries.js';
import {
  AMEND_ONLY_CLOSED,
  BIA_READING_NOT_FOUND,
  EVALUATION_NOT_DRAFT,
  EVALUATION_NOT_FOUND,
  EVALUATION_VERSION_CONFLICT,
  RECALCULATE_ONLY_CLOSED,
  SITE_NOT_FOUND,
  TECHNICAL_ERROR_FORBIDDEN,
} from '../../../domain/assessment-rules.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [EVALUATION_NOT_FOUND.code]: 404,
  [SITE_NOT_FOUND('').code]: 404,
  [BIA_READING_NOT_FOUND.code]: 404,
  [PATIENT_NOT_FOUND.code]: 404,
  [EVALUATION_NOT_DRAFT.code]: 409,
  [EVALUATION_VERSION_CONFLICT.code]: 409,
  [AMEND_ONLY_CLOSED.code]: 409,
  [RECALCULATE_ONLY_CLOSED.code]: 409,
  [PATIENT_ARCHIVED.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [TECHNICAL_ERROR_FORBIDDEN.code]: 403,
};

export const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code]);
const notFound = () =>
  new ProblemException(404, { title: 'No encontrado.', code: EVALUATION_NOT_FOUND.code });

export const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** La versión del If-Match (06 §5); sin ella, 428. */
export function versionOf(ifMatch: string | undefined): number {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version)) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
}

const summaryOf = (e: EvaluationSummaryView): EvaluationSummary => ({
  id: e.id,
  patientId: e.patientId,
  evaluatorMemberId: e.evaluatorMemberId,
  kind: e.kind,
  level: e.level,
  measuredAt: e.measuredAt.toISOString(),
  localDate: e.localDate,
  status: e.status,
  revision: e.revision,
  amendsEvaluationId: e.amendsEvaluationId,
  amendedByEvaluationId: e.amendedByEvaluationId,
  closedAt: e.closedAt?.toISOString() ?? null,
});

const responseOf = (view: EvaluationView): EvaluationResponse => ({
  ...summaryOf(view),
  conditions: view.conditions,
  patientSnapshot: {
    sex: view.patientSnapshot.sex,
    ageYears: view.patientSnapshot.ageYears,
    population: view.patientSnapshot
      .population as EvaluationResponse['patientSnapshot']['population'],
  },
  amendReason: view.amendReason,
  notes: view.notes,
  version: view.version,
  createdAt: view.createdAt.toISOString(),
  measurements: view.measurements.map((m) => ({
    siteCode: m.siteCode,
    attempts: [...m.attempts],
    side: m.side,
    consolidatedValue: m.consolidation.value,
    consolidation: m.consolidation.method,
    diffPct: m.consolidation.diffPct,
    needsThird: m.consolidation.needsThird,
  })),
  biaReadings: view.biaReadings.map((r) => ({
    id: r.id,
    deviceBrand: r.deviceBrand,
    deviceModel: r.deviceModel,
    readings: r.readings.map((value) => ({
      ...value,
    })) as EvaluationResponse['biaReadings'][number]['readings'],
    enteredBy: r.enteredBy,
    createdAt: r.createdAt.toISOString(),
  })),
  progress: {
    requiredSites: [...view.progress.requiredSites],
    missingSites: [...view.progress.missingSites],
    needsThirdSites: [...view.progress.needsThirdSites],
    canClose: view.progress.canClose,
  },
});

/** Catálogo global de sitios (RN-C01, RN-C04): niveles, rangos y tolerancias como datos. */
@Controller('measurement-sites')
export class MeasurementSiteController {
  constructor(private readonly queries: EvaluationQueries) {}

  @Get()
  @RequirePermission('patients.read')
  async list(@Req() request: ContextualRequest): Promise<MeasurementSiteListResponse> {
    const sites = await this.queries.sites(contextOf(request));
    return {
      sites: sites.map((site) => ({
        code: site.code,
        family: site.family,
        nameEs: site.nameEs,
        unit: site.unit,
        minValue: site.minValue,
        maxValue: site.maxValue,
        tolerancePct: site.tolerancePct,
        minAttempts: site.minAttempts,
        levels: [...site.levels],
        displayOrder: site.displayOrder,
      })),
    };
  }
}

/** Evaluaciones de un paciente (RF-11): crear y listar. */
@Controller('patients/:patientId/evaluations')
export class PatientEvaluationsController {
  constructor(
    private readonly commands: EvaluationCommands,
    private readonly queries: EvaluationQueries,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<EvaluationListResponse> {
    const evaluations = await this.queries.list(contextOf(request), patientId);
    if (!evaluations) throw notFound();
    return { evaluations: evaluations.map(summaryOf) };
  }

  @Post()
  @RequirePermission('patients.write')
  async create(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const result = await this.commands.create(
      context,
      patientId,
      parseBody(createEvaluationSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, result.value.id));
  }
}

const found = (view: EvaluationView | null): EvaluationResponse => {
  if (!view) throw notFound();
  return responseOf(view);
};

/**
 * Una evaluación (RF-11 a RF-14): tomas por sitio con If-Match, bioimpedancia, cierre y enmienda. Leer deja un READ
 * (RN-B03); toda escritura devuelve la evaluación con su versión nueva.
 */
@Controller('evaluations/:evaluationId')
export class EvaluationController {
  constructor(
    private readonly commands: EvaluationCommands,
    private readonly queries: EvaluationQueries,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
  ): Promise<EvaluationResponse> {
    return found(await this.queries.get(contextOf(request), id));
  }

  @Patch()
  @RequirePermission('patients.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const result = await this.commands.update(
      context,
      id,
      versionOf(ifMatch),
      parseBody(updateEvaluationSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, id));
  }

  @Put('measurements/:siteCode')
  @RequirePermission('patients.write')
  async recordMeasurement(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Param('siteCode') siteCode: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const result = await this.commands.recordMeasurement(
      context,
      id,
      siteCode,
      versionOf(ifMatch),
      parseBody(recordMeasurementSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, id));
  }

  @Delete('measurements/:siteCode')
  @RequirePermission('patients.write')
  async removeMeasurement(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Param('siteCode') siteCode: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const result = await this.commands.removeMeasurement(context, id, siteCode, versionOf(ifMatch));
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, id));
  }

  @Post('bia-readings')
  @RequirePermission('patients.write')
  async addBiaReading(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const result = await this.commands.addBiaReading(
      context,
      id,
      parseBody(createBiaReadingSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, id));
  }

  @Delete('bia-readings/:readingId')
  @RequirePermission('patients.write')
  async removeBiaReading(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Param('readingId', ParseUUIDPipe) readingId: string,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const result = await this.commands.removeBiaReading(context, id, readingId);
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, id));
  }

  @Post('close')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async close(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const result = await this.commands.close(context, id, versionOf(ifMatch));
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, id));
  }

  /** Crea la revisión en borrador que enmienda esta evaluación cerrada (RN-C07) y la devuelve. */
  @Post('amendments')
  @RequirePermission('patients.write')
  async amend(
    @Req() request: ContextualRequest,
    @Param('evaluationId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<EvaluationResponse> {
    const context = contextOf(request);
    const { reason } = parseBody(amendEvaluationSchema, body);
    const result = await this.commands.amend(context, id, reason);
    if (isErr(result)) throw problem(result.error);
    return found(await this.queries.get(context, result.value.id));
  }
}
