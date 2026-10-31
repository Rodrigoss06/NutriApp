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
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  amendFunctionalEvaluationSchema,
  createFunctionalEvaluationSchema,
  FUNCTIONAL_KINDS,
  saveMovementTestSchema,
  savePhysicalResultSchema,
  type FunctionalCatalogResponse,
  type FunctionalEvaluation,
  type FunctionalEvaluationListResponse,
  type FunctionalEvaluationSummary,
  type PhysicalTestSummaryResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import { z } from 'zod';
import {
  EXTENSIONS,
  MAX_UPLOAD_BYTES,
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type AllowedMime,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { contextOf, versionOf } from './evaluation.controller.js';
import { FunctionalEvaluationCommands } from '../../../application/commands/functional-evaluation.commands.js';
import {
  FunctionalEvaluationQueries,
  type FunctionalEvaluationSummaryView,
  type FunctionalEvaluationView,
} from '../../../application/queries/functional-evaluation.queries.js';
import {
  AMEND_ONLY_CLOSED,
  EVALUATION_NOT_DRAFT,
  EVALUATION_VERSION_CONFLICT,
} from '../../../domain/assessment-rules.js';
import {
  FUNCTIONAL_EVALUATION_NOT_FOUND,
  FUNCTIONAL_TEST_NOT_FOUND,
} from '../../../domain/functional-evaluation.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [FUNCTIONAL_EVALUATION_NOT_FOUND.code]: 404,
  [FUNCTIONAL_TEST_NOT_FOUND.code]: 404,
  [PATIENT_NOT_FOUND.code]: 404,
  [EVALUATION_NOT_DRAFT.code]: 409,
  [EVALUATION_VERSION_CONFLICT.code]: 409,
  [AMEND_ONLY_CLOSED.code]: 409,
  [PATIENT_ARCHIVED.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const notFound = (code = FUNCTIONAL_EVALUATION_NOT_FOUND.code) =>
  new ProblemException(404, { title: 'No encontrado.', code });

const kindQuerySchema = z.object({ kind: z.enum(FUNCTIONAL_KINDS) });

const summaryOf = (e: FunctionalEvaluationSummaryView): FunctionalEvaluationSummary => ({
  id: e.id,
  patientId: e.patientId,
  kind: e.kind,
  moment: e.moment,
  status: e.status,
  revision: e.revision,
  measuredAt: e.measuredAt.toISOString(),
  localDate: e.localDate,
  closedAt: e.closedAt?.toISOString() ?? null,
  evaluatorMemberId: e.evaluatorMemberId,
  amendReason: e.amendReason,
  amendedByEvaluationId: e.amendedByEvaluationId,
  notes: e.notes,
  version: e.version,
});

const detailOf = (e: FunctionalEvaluationView): FunctionalEvaluation => ({
  ...summaryOf(e),
  movementTests: e.movementTests.map(({ evidenceFileId, ...row }) => ({
    ...row,
    hasEvidenceFile: evidenceFileId !== null,
  })),
  physicalResults: e.physicalResults.map(({ evidenceFileId, ...row }) => ({
    ...row,
    hasEvidenceFile: evidenceFileId !== null,
  })),
});

/** Las evaluaciones funcionales de un paciente y el resumen de sus pruebas físicas (RF-41, 07 §3.3 y §4). */
@Controller('patients/:patientId')
export class PatientFunctionalEvaluationsController {
  constructor(
    private readonly commands: FunctionalEvaluationCommands,
    private readonly queries: FunctionalEvaluationQueries,
  ) {}

  @Get('functional-evaluations')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: unknown,
  ): Promise<FunctionalEvaluationListResponse> {
    const { kind } = parseBody(kindQuerySchema, query);
    const evaluations = await this.queries.list(contextOf(request), patientId, kind);
    if (!evaluations) throw notFound(PATIENT_NOT_FOUND.code);
    return { evaluations: evaluations.map(summaryOf) };
  }

  @Post('functional-evaluations')
  @RequirePermission('patients.write')
  async create(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.commands.create(
      contextOf(request),
      patientId,
      parseBody(createFunctionalEvaluationSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Get('physical-test-summary')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async physicalSummary(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<PhysicalTestSummaryResponse> {
    const tests = await this.queries.physicalSummary(contextOf(request), patientId);
    if (!tests) throw notFound(PATIENT_NOT_FOUND.code);
    return { tests: [...tests] };
  }
}

interface UploadedEvidence {
  readonly buffer: Buffer;
}

/** Una evaluación funcional por su id: pruebas, evidencia, cierre y enmienda. */
@Controller('functional-evaluations')
export class FunctionalEvaluationController {
  constructor(
    private readonly commands: FunctionalEvaluationCommands,
    private readonly queries: FunctionalEvaluationQueries,
  ) {}

  /** Las 14 pruebas de postura y las 15 físicas, en su orden. */
  @Get('catalog')
  @RequirePermission('patients.read')
  async catalog(@Req() request: ContextualRequest): Promise<FunctionalCatalogResponse> {
    const { movementTests, physicalTests } = await this.queries.catalog(contextOf(request));
    return {
      movementTests: movementTests.map((test) => ({ ...test })),
      physicalTests: physicalTests.map((test) => ({ ...test })),
    };
  }

  @Get(':id')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FunctionalEvaluation> {
    const view = await this.queries.get(contextOf(request), id);
    if (!view) throw notFound();
    return detailOf(view);
  }

  @Put(':id/movement/:testCode')
  @RequirePermission('patients.write')
  async saveMovementTest(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCode') testCode: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<FunctionalEvaluation> {
    const result = await this.commands.saveMovementTest(
      contextOf(request),
      id,
      testCode,
      versionOf(ifMatch),
      parseBody(saveMovementTestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Put(':id/physical/:testCode')
  @RequirePermission('patients.write')
  async savePhysicalResult(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCode') testCode: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<FunctionalEvaluation> {
    const result = await this.commands.savePhysicalResult(
      contextOf(request),
      id,
      testCode,
      versionOf(ifMatch),
      parseBody(savePhysicalResultSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Delete(':id/tests/:testCode')
  @RequirePermission('patients.write')
  async removeTest(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCode') testCode: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FunctionalEvaluation> {
    const result = await this.commands.removeTest(
      contextOf(request),
      id,
      testCode,
      versionOf(ifMatch),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  /** La evidencia en un pedido multipart (campo «evidence»), acotado a 5 MB por el parser (ADR-038). */
  @Post(':id/tests/:testCode/evidence')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('evidence', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }),
  )
  async attachEvidence(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCode') testCode: string,
    @Headers('if-match') ifMatch: string | undefined,
    @UploadedFile() evidence: UploadedEvidence | undefined,
  ): Promise<FunctionalEvaluation> {
    if (!evidence) {
      throw new ProblemException(400, {
        title: 'Adjunta la evidencia en el campo «evidence».',
        code: 'NC-ASM-026',
      });
    }
    const result = await this.commands.attachEvidence(
      contextOf(request),
      id,
      testCode,
      versionOf(ifMatch),
      new Uint8Array(evidence.buffer),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Delete(':id/tests/:testCode/evidence')
  @RequirePermission('patients.write')
  async removeEvidence(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCode') testCode: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FunctionalEvaluation> {
    const result = await this.commands.removeEvidence(
      contextOf(request),
      id,
      testCode,
      versionOf(ifMatch),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  /** Descarga solo por la API: con la visibilidad del paciente, auditada, como adjunto y sin adivinar el tipo. */
  @Get(':id/tests/:testCode/evidence')
  @RequirePermission('patients.read')
  async evidence(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testCode') testCode: string,
  ): Promise<void> {
    const file = await this.queries.evidence(contextOf(request), id, testCode);
    if (!file) throw notFound();
    const extension = EXTENSIONS[file.mimeType as AllowedMime];
    response
      .status(200)
      .set({
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="evidencia-evaluacion.${extension}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      })
      .send(file.content);
  }

  @Post(':id/close')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async close(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<FunctionalEvaluation> {
    const result = await this.commands.close(contextOf(request), id, versionOf(ifMatch));
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Post(':id/amend')
  @RequirePermission('patients.write')
  async amend(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const { reason } = parseBody(amendFunctionalEvaluationSchema, body);
    const result = await this.commands.amend(contextOf(request), id, reason);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}
