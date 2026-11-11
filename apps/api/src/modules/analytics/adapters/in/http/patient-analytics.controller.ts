import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import type { DietAnalytics, DietTrend, TrainingAnalytics } from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import { z } from 'zod';
import {
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { PATIENT_NOT_FOUND } from '../../../../clinical/index.js';
import { DietQueries } from '../../../application/queries/diet.queries.js';
import { TrainingQueries } from '../../../application/queries/training.queries.js';
import { PROGRAM_NOT_FOUND, RANGE_INVALID } from '../../../domain/analytics-errors.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [RANGE_INVALID.code]: 400,
  [PROGRAM_NOT_FOUND.code]: 404,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const isoDate = z.iso.date();
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

/** Una fecha opcional del rango: AAAA-MM-DD o nada. */
const dateOf = (value: string | undefined, field: string): string | null => {
  if (value === undefined) return null;
  const parsed = isoDate.safeParse(value);
  if (!parsed.success) {
    throw new ProblemException(400, {
      title: `${field} debe ser AAAA-MM-DD.`,
      code: 'NC-PLT-400',
    });
  }
  return parsed.data;
};

/**
 * La analítica del paciente para su equipo de atención (RF-32, RF-33): lee los read models ya agregados (05 §1), cada número con su
 * método (RN-D02). La lectura queda en la auditoría (RN-B03).
 */
@Controller('patients/:patientId/analytics')
export class PatientAnalyticsController {
  constructor(
    private readonly diet: DietQueries,
    private readonly routine: TrainingQueries,
  ) {}

  @Get('diet')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async dietAnalytics(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<DietAnalytics> {
    const result = await this.diet.diet(contextOf(request), patientId, {
      from: dateOf(from, 'La fecha de inicio'),
      to: dateOf(to, 'La fecha de fin'),
    });
    if (isErr(result)) throw problem(result.error);
    const view = result.value;
    return {
      from: view.from,
      to: view.to,
      adequacyRangePct: [view.adequacyRangePct[0], view.adequacyRangePct[1]],
      method: { ...view.method },
      days: view.days.map((day) => ({
        localDate: day.localDate,
        kcal: day.kcal,
        choG: day.choG,
        proteinG: day.proteinG,
        fatG: day.fatG,
        fiberG: day.fiberG,
        dayKind: day.dayKind,
        dayProfile:
          day.dayProfileCode && day.dayProfileName
            ? { code: day.dayProfileCode, name: day.dayProfileName }
            : null,
        targetKcal: day.targetKcal,
        targetChoG: day.targetChoG,
        targetProteinG: day.targetProteinG,
        targetFatG: day.targetFatG,
        adequacyKcalPct: day.adequacyKcalPct,
        adequacyChoPct: day.adequacyChoPct,
        adequacyProteinPct: day.adequacyProteinPct,
        adequacyFatPct: day.adequacyFatPct,
        kcalInRange: day.kcalInRange,
        mealsLogged: day.mealsLogged,
        mealsPlanned: day.mealsPlanned,
        offPlanItems: day.offPlanItems,
        waterMl: day.waterMl,
        waterTargetMl: day.waterTargetMl,
        nutrientsMissing: { ...day.nutrientsMissing },
      })),
      weeks: view.weeks.map((week) => ({
        ...week,
        kcal: { ...week.kcal },
        choG: { ...week.choG },
        proteinG: { ...week.proteinG },
        fatG: { ...week.fatG },
      })),
      mealSlots: view.mealSlots.map((slot) => ({ ...slot })),
    };
  }

  /** RN-G09 · la tendencia por mes, para leerla frente a la evolución antropométrica (ADR-091). */
  @Get('trend')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async trend(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<DietTrend> {
    const result = await this.diet.trend(contextOf(request), patientId, {
      from: dateOf(from, 'La fecha de inicio'),
      to: dateOf(to, 'La fecha de fin'),
    });
    if (isErr(result)) throw problem(result.error);
    const view = result.value;
    return {
      from: view.from,
      to: view.to,
      adequacyRangePct: [view.adequacyRangePct[0], view.adequacyRangePct[1]],
      method: { ...view.method },
      months: view.months.map((month) => ({ ...month, kcal: { ...month.kcal } })),
    };
  }

  /** El macrociclo del programa vigente, o del que se pida de este paciente (RF-33). */
  @Get('training')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async trainingAnalytics(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('programId') programId?: string,
  ): Promise<TrainingAnalytics> {
    if (programId !== undefined && !uuid.safeParse(programId).success) {
      throw new ProblemException(400, {
        title: 'El programa debe ser un identificador válido.',
        code: 'NC-PLT-400',
      });
    }
    const result = await this.routine.training(contextOf(request), patientId, programId ?? null);
    if (isErr(result)) throw problem(result.error);
    const view = result.value;
    return {
      program: view.program && { ...view.program },
      methods: {
        tonnage: { ...view.methods.tonnage },
        adjustedVolume: { ...view.methods.adjustedVolume },
        fatiguePanel: { ...view.methods.fatiguePanel },
        fractionalSets: { ...view.methods.fractionalSets },
        compliance: { ...view.methods.compliance },
        sfr: { ...view.methods.sfr },
        rpe: { ...view.methods.rpe },
        srpe: { ...view.methods.srpe },
      },
      mesocycles: view.mesocycles.map((mesocycle) => ({ ...mesocycle })),
      weeks: view.weeks.map((week) => ({
        ...week,
        muscles: week.muscles.map((muscle) => ({ ...muscle })),
        fatigue: week.fatigue && { ...week.fatigue },
      })),
      oneRm: view.oneRm.map((series) => ({
        ...series,
        method: series.method && { ...series.method },
        points: series.points.map((point) => ({ ...point })),
      })),
    };
  }
}
