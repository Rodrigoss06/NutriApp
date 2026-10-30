import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  exerciseSearchQuerySchema,
  ownExerciseRequestSchema,
  patternChoiceParamsSchema,
  patternChoiceRequestSchema,
  type ExerciseCatalogResponse,
  type ExerciseDetail,
  type ExerciseListResponse,
  type PatternChoiceListResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { OwnExerciseCommands } from '../../../application/commands/own-exercise.commands.js';
import { PatternChoiceCommands } from '../../../application/commands/pattern-choice.commands.js';
import type { ExerciseRecord } from '../../../application/ports/exercise.port.js';
import { ExerciseQueries } from '../../../application/queries/exercise.queries.js';
import {
  EXERCISE_NOT_FOUND,
  EXERCISE_VERSION_CONFLICT,
  GLOBAL_EXERCISE_READ_ONLY,
} from '../../../domain/exercise-errors.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [EXERCISE_NOT_FOUND.code]: 404,
  [GLOBAL_EXERCISE_READ_ONLY.code]: 403,
  [EXERCISE_VERSION_CONFLICT.code]: 409,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** La versión leída, en If-Match (02 §5); sin ella, 428. */
const versionOf = (ifMatch: string | undefined): number => {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version)) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
};

const detailOf = (exercise: ExerciseRecord): ExerciseDetail => ({
  id: exercise.id,
  name: exercise.name,
  aliases: [...exercise.aliases],
  code: exercise.code,
  pattern: exercise.pattern,
  level: exercise.level,
  modality: exercise.modality,
  equipmentCode: exercise.equipmentCode,
  equipmentName: exercise.equipmentName,
  isUnilateral: exercise.isUnilateral,
  primaryMuscles: exercise.primaryMuscles.map((muscle) => ({ ...muscle })),
  secondaryMuscles: exercise.secondaryMuscles.map((muscle) => ({ ...muscle })),
  caution: exercise.caution,
  alternative: exercise.alternative ? { ...exercise.alternative } : null,
  easierVariant: exercise.easierVariant ? { ...exercise.easierVariant } : null,
  harderVariant: exercise.harderVariant ? { ...exercise.harderVariant } : null,
  baseSets: exercise.baseSets,
  baseRepsMin: exercise.baseRepsMin,
  baseRepsMax: exercise.baseRepsMax,
  baseMeasure: exercise.baseMeasure,
  baseRestSeconds: exercise.baseRestSeconds,
  mediaUrl: exercise.mediaUrl,
  instructions: exercise.instructions,
  own: exercise.own,
  provisional: exercise.provisional,
  status: exercise.status,
  version: exercise.version,
});

/**
 * /api/v1/exercises: la biblioteca de ejercicios (RF-25, RF-38). Los globales son de solo lectura y cada organización
 * edita los suyos (RN-I01).
 */
@Controller('exercises')
export class ExerciseController {
  constructor(
    private readonly queries: ExerciseQueries,
    private readonly commands: OwnExerciseCommands,
  ) {}

  /** GET /api/v1/exercises?q=sentadilla&pattern=SQUAT&level=BEGINNER&equipment=DUMBBELL&muscle=GLUTES */
  @Get()
  @RequirePermission('catalog.read')
  async search(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<ExerciseListResponse> {
    const { q, pattern, level, equipment, muscle, status, limit } = parseBody(
      exerciseSearchQuerySchema,
      query,
    );
    const exercises = await this.queries.search(contextOf(request), {
      text: q ? q : null,
      pattern: pattern ?? null,
      level: level ?? null,
      equipmentCode: equipment ?? null,
      muscleCode: muscle ?? null,
      status,
      limit,
    });
    return {
      exercises: exercises.map((exercise) => ({
        ...exercise,
        aliases: [...exercise.aliases],
        primaryMuscles: [...exercise.primaryMuscles],
      })),
    };
  }

  /** GET /api/v1/exercises/catalog: patrones, grupos musculares y equipos, para filtros y formularios. */
  @Get('catalog')
  @RequirePermission('catalog.read')
  async catalog(@Req() request: ContextualRequest): Promise<ExerciseCatalogResponse> {
    const catalog = await this.queries.catalog(contextOf(request));
    return {
      patterns: catalog.patterns.map((pattern) => ({ ...pattern })),
      muscles: catalog.muscles.map((muscle) => ({ ...muscle })),
      equipment: catalog.equipment.map((equipment) => ({ ...equipment })),
    };
  }

  @Get(':exerciseId')
  @RequirePermission('catalog.read')
  async get(
    @Req() request: ContextualRequest,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
  ): Promise<ExerciseDetail> {
    const result = await this.queries.detail(contextOf(request), exerciseId);
    if (isErr(result)) throw problem(result.error);
    return detailOf(result.value);
  }

  @Post()
  @RequirePermission('catalog.write')
  async create(@Req() request: ContextualRequest, @Body() body: unknown): Promise<ExerciseDetail> {
    const result = await this.commands.create(
      contextOf(request),
      parseBody(ownExerciseRequestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, result.value.id);
  }

  @Put(':exerciseId')
  @RequirePermission('catalog.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<ExerciseDetail> {
    const version = versionOf(ifMatch);
    const result = await this.commands.update(
      contextOf(request),
      exerciseId,
      version,
      parseBody(ownExerciseRequestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, exerciseId);
  }

  /** POST /api/v1/exercises/:exerciseId/archive con If-Match: deja de ofrecerse al prescribir. */
  @Post(':exerciseId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalog.write')
  async archive(
    @Req() request: ContextualRequest,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ExerciseDetail> {
    const version = versionOf(ifMatch);
    const result = await this.commands.archive(contextOf(request), exerciseId, version);
    if (isErr(result)) throw problem(result.error);
    return this.get(request, exerciseId);
  }

  /** POST /api/v1/exercises/:exerciseId/restore con If-Match: vuelve a ofrecerse. */
  @Post(':exerciseId/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalog.write')
  async restore(
    @Req() request: ContextualRequest,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ExerciseDetail> {
    const version = versionOf(ifMatch);
    const result = await this.commands.restore(contextOf(request), exerciseId, version);
    if (isErr(result)) throw problem(result.error);
    return this.get(request, exerciseId);
  }
}

/** /api/v1/exercise-pattern-choices: el ejercicio sugerido por patrón y nivel, configurable por organización (07 §5). */
@Controller('exercise-pattern-choices')
export class PatternChoiceController {
  constructor(
    private readonly queries: ExerciseQueries,
    private readonly commands: PatternChoiceCommands,
  ) {}

  @Get()
  @RequirePermission('catalog.read')
  async list(@Req() request: ContextualRequest): Promise<PatternChoiceListResponse> {
    const choices = await this.queries.patternChoices(contextOf(request));
    return {
      choices: choices.map((choice) => ({ ...choice, exercise: { ...choice.exercise } })),
    };
  }

  /** La organización reemplaza esa fila: solo cuenta para las propuestas siguientes. */
  @Put(':pattern/:level')
  @RequirePermission('catalog.write')
  async set(
    @Req() request: ContextualRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ): Promise<PatternChoiceListResponse> {
    const { pattern, level } = parseBody(patternChoiceParamsSchema, params);
    const { exerciseId } = parseBody(patternChoiceRequestSchema, body);
    const result = await this.commands.set(contextOf(request), pattern, level, exerciseId);
    if (isErr(result)) throw problem(result.error);
    return this.list(request);
  }

  /** Vuelve a la fila de la V3. */
  @Delete(':pattern/:level')
  @RequirePermission('catalog.write')
  async clear(
    @Req() request: ContextualRequest,
    @Param() params: unknown,
  ): Promise<PatternChoiceListResponse> {
    const { pattern, level } = parseBody(patternChoiceParamsSchema, params);
    const result = await this.commands.clear(contextOf(request), pattern, level);
    if (isErr(result)) throw problem(result.error);
    return this.list(request);
  }
}
