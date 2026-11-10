import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  correctFoodLogSchema,
  logCheckinSchema,
  logFoodSchema,
  logHydrationSchema,
  logMetricSchema,
  logNoteSchema,
  logWorkoutSchema,
  todayActionSchema,
  type Checkin,
  type DaySchedule,
  type FoodListResponse,
  type FoodLog,
  type FoodLogsResponse,
  type HydrationLog,
  type MeDay,
  type MePlan,
  type MeToday,
  type MetricLog,
  type MeTraining,
  type NoteLog,
  type Readiness,
  type WorkoutLog,
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
import { DayScheduleCommands } from '../../../application/commands/day-schedule.commands.js';
import { RecordCommands, type Logged } from '../../../application/commands/record.commands.js';
import { TrainingLogCommands } from '../../../application/commands/training-log.commands.js';
import type {
  StoredCheckin,
  StoredFoodLog,
  StoredHydrationLog,
  StoredMetric,
  StoredNote,
  StoredReadiness,
  StoredWorkout,
} from '../../../application/ports/records.ports.js';
import { MeQueries } from '../../../application/queries/me.queries.js';
import type { DaySchedule as ScheduleView } from '../../../domain/day-schedule.js';
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
/** La nota como la ve el paciente: sin quién ni cuándo la leyó su equipo (RN-G13). */
const noteOf = (note: StoredNote): NoteLog => ({
  id: note.id,
  clientId: note.clientId,
  localDate: note.localDate,
  body: note.body,
  createdAt: note.createdAt.toISOString(),
});
const metricOf = (metric: StoredMetric): MetricLog => ({
  ...metric,
  metricCode: metric.metricCode as MetricLog['metricCode'],
});

const readinessOf = (readiness: StoredReadiness): Readiness => ({
  indication: readiness.indication,
  readinessScore: readiness.readinessScore,
  components: { ...readiness.components },
  neutralComponents: [...readiness.neutralComponents],
  srpeLoad: readiness.srpeLoad,
  performancePct: readiness.performancePct,
  methodCode: readiness.methodCode,
  methodVersion: readiness.methodVersion,
});
const checkinOf = (checkin: StoredCheckin): Checkin => ({
  ...checkin,
  readiness: checkin.readiness && readinessOf(checkin.readiness),
});
const workoutOf = (workout: StoredWorkout): WorkoutLog => ({ ...workout });
/** La agenda como la ve el paciente: sin los perfiles que puede elegir el coach (ADR-104). */
const scheduleOf = ({ today, tomorrow, options }: ScheduleView): DaySchedule => ({
  today,
  tomorrow,
  options,
});

/** 201 si quedó registrado ahora; 200 si es un reintento con el mismo clientId y vuelve lo de la primera vez (RN-G08). */
function respond<T, R>(response: Response, logged: Logged<T>, map: (value: T) => R): R {
  response.status(logged.replayed ? 200 : 201);
  return map(logged.value);
}

/**
 * Lo que el paciente ve y registra desde su app (RF-27 a RF-29, 02 §10): su día, su plan, su entreno y sus registros de comida, agua,
 * notas, peso, registro diario y sesiones. Rutas /me: nunca envía su id. Cada registro lleva su clientId (RN-G08) y la Idempotency-Key de la petición.
 */
@Controller('me')
export class MeTrackingController {
  constructor(
    private readonly commands: RecordCommands,
    private readonly training: TrainingLogCommands,
    private readonly queries: MeQueries,
    private readonly schedules: DayScheduleCommands,
  ) {}

  @Get('today')
  @PatientOnly()
  async today(@Req() request: ContextualRequest): Promise<MeToday> {
    const view = await this.queries.today(contextOf(request));
    return {
      ...view,
      sessions: view.sessions ? [...view.sessions] : null,
      readiness: view.readiness && readinessOf(view.readiness),
      schedule: scheduleOf(view.schedule),
    };
  }

  /** «No entreno hoy», «mover a mañana» o «sí entreno hoy» (P-20.3, ADR-104): responde la agenda ya cambiada. */
  @Post('schedule/today')
  @PatientOnly()
  @HttpCode(HttpStatus.OK)
  async changeToday(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<DaySchedule> {
    const { action } = parseBody(todayActionSchema, body);
    const result = await this.schedules.patientToday(contextOf(request), action);
    if (isErr(result)) throw problem(result.error);
    return scheduleOf(result.value);
  }

  /** El entreno de hoy (RF-29): las sesiones del programa vigente, lo registrado y su registro diario. */
  @Get('training')
  @PatientOnly()
  async trainingToday(@Req() request: ContextualRequest): Promise<MeTraining> {
    const view = await this.queries.trainingToday(contextOf(request));
    return {
      ...view,
      sessions: view.sessions.map((session) => ({
        ...session,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          primaryMuscles: [...exercise.primaryMuscles],
          secondaryMuscles: [...exercise.secondaryMuscles],
          sets: exercise.sets.map((set) => ({ ...set })),
        })),
      })),
      workouts: view.workouts.map(workoutOf),
      checkin: view.checkin && checkinOf(view.checkin),
    };
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
      checkin: day.checkin && checkinOf(day.checkin),
      workouts: day.workouts.map(workoutOf),
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

  /** El registro diario (RN-G11): otra vez el mismo día lo corrige (RN-G12); responde con la indicación del día (RN-G15). */
  @Post('checkins')
  @PatientOnly()
  async logCheckin(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<Checkin> {
    const result = await this.training.logCheckin(
      contextOf(request),
      parseBody(logCheckinSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return respond(response, result.value, checkinOf);
  }

  @Post('checkins/:id/void')
  @PatientOnly()
  async voidCheckin(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', uuid) id: string,
  ): Promise<Checkin> {
    const result = await this.training.voidCheckin(contextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    response.status(200);
    return checkinOf(result.value);
  }

  @Post('workouts')
  @PatientOnly()
  async logWorkout(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<WorkoutLog> {
    const result = await this.training.logWorkout(
      contextOf(request),
      parseBody(logWorkoutSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return respond(response, result.value, workoutOf);
  }

  @Post('workouts/:id/void')
  @PatientOnly()
  async voidWorkout(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', uuid) id: string,
  ): Promise<WorkoutLog> {
    const result = await this.training.voidWorkout(contextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    response.status(200);
    return workoutOf(result.value);
  }
}
