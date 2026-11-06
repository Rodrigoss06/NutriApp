import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  decideWeeklyReviewSchema,
  type WeeklyReviewDecisionResponse,
  type WeeklyReviewsResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import { z } from 'zod';
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
import { WeeklyReviewCommands } from '../../../application/commands/weekly-review.commands.js';
import {
  WeeklyReviewQueries,
  type WeeklyReviewView,
} from '../../../application/queries/weekly-review.queries.js';
import { PROGRAM_VERSION_CONFLICT } from '../../../domain/program.js';
import {
  DECISION_FACTOR_REQUIRED,
  NO_PUBLISHED_PROGRAM,
  REVIEW_ALREADY_DECIDED,
  REVIEW_NOT_FOUND,
  REVIEW_SUPERSEDED,
} from '../../../domain/weekly-review.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [REVIEW_NOT_FOUND.code]: 404,
  [NO_PUBLISHED_PROGRAM.code]: 404,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [PATIENT_ARCHIVED.code]: 409,
  [REVIEW_SUPERSEDED.code]: 409,
  [REVIEW_ALREADY_DECIDED.code]: 409,
  [PROGRAM_VERSION_CONFLICT.code]: 409,
  [DECISION_FACTOR_REQUIRED.code]: 422,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const uuid = z.uuid();

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const reviewOf = (review: WeeklyReviewView): WeeklyReviewsResponse['reviews'][number] => ({
  id: review.id,
  programId: review.programId,
  weekNo: review.weekNo,
  weekStart: review.weekStart,
  weekEnd: review.weekEnd,
  method: { code: review.methodCode, version: review.methodVersion },
  light: review.light,
  reasons: [...review.reasons],
  aggregates: review.aggregates && { ...review.aggregates },
  plannedVolumeFactor: review.plannedVolumeFactor,
  suggestedVolumeFactor: review.suggestedVolumeFactor,
  suggestedAction: review.suggestedAction,
  computedAt: review.computedAt.toISOString(),
  decision:
    review.coachDecision && review.decidedBy && review.decidedAt
      ? {
          decision: review.coachDecision,
          volumeFactor: review.decidedVolumeFactor,
          note: review.decisionNote ?? '',
          decidedBy: review.decidedBy,
          decidedAt: review.decidedAt.toISOString(),
        }
      : null,
  resultingProgram: review.resultingProgramId
    ? {
        programId: review.resultingProgramId,
        status:
          review.resultingProgramStatus === 'DRAFT' ||
          review.resultingProgramStatus === 'PUBLISHED' ||
          review.resultingProgramStatus === 'SUPERSEDED'
            ? review.resultingProgramStatus
            : null,
      }
    : null,
  supersededCount: review.supersededCount,
});

/**
 * El control semanal del macrociclo para el equipo de atención (RF-42): leerlo, calcularlo al abrirlo y decidir con nota (RN-F17).
 * Decidir ajustar o descargar deja la versión siguiente del programa en borrador; la semana cambia solo al publicarla (RN-F12).
 */
@Controller('patients/:patientId/weekly-reviews')
export class WeeklyReviewController {
  constructor(
    private readonly queries: WeeklyReviewQueries,
    private readonly commands: WeeklyReviewCommands,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('programId') programId?: string,
  ): Promise<WeeklyReviewsResponse> {
    if (programId !== undefined && !uuid.safeParse(programId).success) {
      throw new ProblemException(400, {
        title: 'El programa debe ser un identificador válido.',
        code: 'NC-PLT-400',
      });
    }
    const result = await this.queries.list(contextOf(request), patientId, programId ?? null);
    if (isErr(result)) throw problem(result.error);
    return {
      program: result.value.program && { ...result.value.program },
      reviews: result.value.reviews.map(reviewOf),
    };
  }

  /** El coach abre el control (07 §10): las semanas cerradas se calculan ya, sin esperar al trabajo de cada hora. */
  @Post('compute')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async compute(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<{ written: number }> {
    const result = await this.commands.compute(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Post(':reviewId/decision')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: unknown,
  ): Promise<WeeklyReviewDecisionResponse> {
    const input = parseBody(decideWeeklyReviewSchema, body);
    const result = await this.commands.decide(contextOf(request), patientId, reviewId, input);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}
