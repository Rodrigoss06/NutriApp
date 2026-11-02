import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import {
  correctFoodLogSchema,
  logFoodSchema,
  logHydrationSchema,
  logMetricSchema,
  logNoteSchema,
  type FoodListResponse,
  type FoodLog,
  type FoodLogsResponse,
  type HydrationLog,
  type MeDay,
  type MePlan,
  type MeToday,
  type MetricLog,
  type NoteLog,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import { z } from 'zod';
import {
  parseBody,
  PatientOnly,
  problemFromDomainError,
  ProblemException,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { RecordCommands, type Logged } from '../../../application/commands/record.commands.js';
import type {
  StoredFoodLog,
  StoredHydrationLog,
  StoredMetric,
  StoredNote,
} from '../../../application/ports/records.ports.js';
import { MeQueries } from '../../../application/queries/me.queries.js';
import { FOOD_NOT_FOUND, RECORD_NOT_FOUND } from '../../../domain/tracking-errors.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [RECORD_NOT_FOUND.code]: 404,
  [FOOD_NOT_FOUND.code]: 404,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

const uuid = new ParseUUIDPipe({ version: '7' });
const isoDate = z.iso.date();

/** El contexto del paciente que fijó SessionGuard (02 §10): su organización y su paciente salen de la sesión. */
const contextOf = (request: ContextualRequest): SecurityContext => {
  const context = request.securityContext;
  if (context?.role !== 'PATIENT' || !context.patientId) {
    throw new ProblemException(403, {
      title: 'Esta sección es de la app del paciente.',
      code: 'NC-PLT-013',
    });
  }
  return context;
};

const dateOf = (value: string | undefined, name: string): string => {
  const parsed = isoDate.safeParse(value);
  if (!parsed.success) {
    throw new ProblemException(400, {
      title: `${name} debe ser una fecha AAAA-MM-DD.`,
      code: 'NC-PLT-400',
    });
  }
  return parsed.data;
};

const foodLogOf = (log: StoredFoodLog): FoodLog => ({
  ...log,
  loggedAt: log.loggedAt.toISOString(),
});
const hydrationOf = (log: StoredHydrationLog): HydrationLog => ({
  ...log,
  loggedAt: log.loggedAt.toISOString(),
});
const noteOf = (note: StoredNote): NoteLog => ({
  ...note,
  createdAt: note.createdAt.toISOString(),
});
const metricOf = (metric: StoredMetric): MetricLog => ({
  ...metric,
  metricCode: metric.metricCode as MetricLog['metricCode'],
});

/** 201 si quedó registrado ahora; 200 si es un reintento con el mismo clientId y vuelve lo de la primera vez (RN-G08). */
function respond<T, R>(response: Response, logged: Logged<T>, map: (value: T) => R): R {
  response.status(logged.replayed ? 200 : 201);
  return map(logged.value);
}

/**
 * Lo que el paciente ve y registra desde su app (RF-27, RF-28, 02 §10): su día, su plan y sus registros de comida, agua, notas y
 * peso. Rutas /me: nunca envía su id. Cada registro lleva su clientId (RN-G08) y la Idempotency-Key de la petición.
 */
@Controller('me')
export class MeTrackingController {
  constructor(
    private readonly commands: RecordCommands,
    private readonly queries: MeQueries,
  ) {}

  @Get('today')
  @PatientOnly()
  async today(@Req() request: ContextualRequest): Promise<MeToday> {
    const view = await this.queries.today(contextOf(request));
    return { ...view, sessions: view.sessions ? [...view.sessions] : null };
  }

  @Get('plan')
  @PatientOnly()
  async plan(@Req() request: ContextualRequest, @Query('date') date?: string): Promise<MePlan> {
    const plan = await this.queries.plan(
      contextOf(request),
      date === undefined ? null : dateOf(date, 'date'),
    );
    return { plan: plan as MePlan['plan'] };
  }

  @Get('days/:date')
  @PatientOnly()
  async day(@Req() request: ContextualRequest, @Param('date') date: string): Promise<MeDay> {
    const result = await this.queries.day(contextOf(request), dateOf(date, 'La fecha'));
    if (isErr(result)) throw problem(result.error);
    const day = result.value;
    return {
      ...day,
      foods: day.foods.map(foodLogOf),
      hydration: day.hydration.map(hydrationOf),
      notes: day.notes.map(noteOf),
      metrics: day.metrics.map(metricOf),
    };
  }

  /** Fuera del plan (RN-G05): el catálogo, sin el código del alimento en su fuente (ADR-055). */
  @Get('foods')
  @PatientOnly()
  async foods(
    @Req() request: ContextualRequest,
    @Query('q') q?: string,
  ): Promise<FoodListResponse> {
    const foods = await this.queries.searchFoods(contextOf(request), (q ?? '').slice(0, 100));
    return {
      foods: foods.map((food) => ({
        id: food.id,
        name: food.name,
        sourceCode: food.sourceCode,
        groupName: food.groupName,
        state: food.state,
        own: food.own,
        energyKcalPer100g: food.energyKcalPer100g,
      })),
    };
  }

  @Post('food-logs')
  @PatientOnly()
  async logFood(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<FoodLogsResponse> {
    const result = await this.commands.logFood(contextOf(request), parseBody(logFoodSchema, body));
    if (isErr(result)) throw problem(result.error);
    return respond(response, result.value, (records) => ({ records: records.map(foodLogOf) }));
  }

  @Post('food-logs/:id/correct')
  @PatientOnly()
  async correctFood(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<FoodLogsResponse> {
    const result = await this.commands.correctFood(
      contextOf(request),
      id,
      parseBody(correctFoodLogSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return respond(response, result.value, (records) => ({ records: records.map(foodLogOf) }));
  }

  @Post('food-logs/:id/void')
  @PatientOnly()
  async voidFood(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', uuid) id: string,
  ): Promise<FoodLog> {
    const result = await this.commands.voidFood(contextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    response.status(200);
    return foodLogOf(result.value);
  }

  @Post('hydration-logs')
  @PatientOnly()
  async logHydration(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<HydrationLog> {
    const result = await this.commands.logHydration(
      contextOf(request),
      parseBody(logHydrationSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return respond(response, result.value, hydrationOf);
  }

  @Post('hydration-logs/:id/void')
  @PatientOnly()
  async voidHydration(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', uuid) id: string,
  ): Promise<HydrationLog> {
    const result = await this.commands.voidHydration(contextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    response.status(200);
    return hydrationOf(result.value);
  }

  @Post('notes')
  @PatientOnly()
  async logNote(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<NoteLog> {
    const result = await this.commands.logNote(contextOf(request), parseBody(logNoteSchema, body));
    if (isErr(result)) throw problem(result.error);
    return respond(response, result.value, noteOf);
  }

  @Post('metrics')
  @PatientOnly()
  async logMetric(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<MetricLog> {
    const result = await this.commands.logMetric(
      contextOf(request),
      parseBody(logMetricSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return respond(response, result.value, metricOf);
  }

  @Post('metrics/:id/void')
  @PatientOnly()
  async voidMetric(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', uuid) id: string,
  ): Promise<MetricLog> {
    const result = await this.commands.voidMetric(contextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    response.status(200);
    return metricOf(result.value);
  }
}
