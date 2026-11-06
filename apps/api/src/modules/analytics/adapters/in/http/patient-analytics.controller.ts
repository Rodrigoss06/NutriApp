import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import type { DietAnalytics } from '@nutricoach/contracts';
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
import { RANGE_INVALID } from '../../../domain/analytics-errors.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [RANGE_INVALID.code]: 400,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const isoDate = z.iso.date();

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
 * La analítica del paciente para su equipo de atención (RF-32): lee los resúmenes ya agregados (05 §1), cada adecuación con su
 * método (RN-D02). La lectura queda en la auditoría (RN-B03).
 */
@Controller('patients/:patientId/analytics')
export class PatientAnalyticsController {
  constructor(private readonly diet: DietQueries) {}

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
}
