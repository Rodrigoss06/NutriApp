import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type { AnalyticsStore } from '../../../application/ports/analytics.ports.js';
import {
  SUMMARY_NUTRIENTS,
  type DailySummary,
  type MealSlotDay,
  type SummaryNutrient,
} from '../../../domain/daily-summary.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

/** Las claves de nutrients_missing en la base, en snake_case como las columnas (05.3). */
const MISSING_COLUMN: Readonly<Record<SummaryNutrient | 'items', string>> = {
  items: 'items',
  kcal: 'kcal',
  choG: 'cho_g',
  proteinG: 'protein_g',
  fatG: 'fat_g',
  fiberG: 'fiber_g',
};

const countAt = (json: unknown, key: string): number => {
  if (json === null || typeof json !== 'object') return 0;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : 0;
};

const mealSlotsOf = (json: unknown): Record<string, MealSlotDay> => {
  if (json === null || typeof json !== 'object') return {};
  return Object.fromEntries(
    Object.entries(json as Record<string, unknown>).flatMap(([code, slot]) => {
      if (slot === null || typeof slot !== 'object') return [];
      const { planned, logged } = slot as Record<string, unknown>;
      return typeof planned === 'boolean' && typeof logged === 'number'
        ? [[code, { planned, logged }]]
        : [];
    }),
  );
};

/** Los read models de analytics (05.3) con la RLS del contexto: SYSTEM al escribir, el equipo de atención al leer (RN-A05). */
@Injectable()
export class PrismaAnalyticsStore implements AnalyticsStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async replaceDailySummaries(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
    rows: readonly DailySummary[],
  ): Promise<void> {
    await this.db.tx.patientDailySummary.deleteMany({
      where: { patientId, localDate: { gte: asDate(from), lte: asDate(to) } },
    });
    if (rows.length === 0) return;
    await this.db.tx.patientDailySummary.createMany({
      data: rows.map((row) => ({
        patientId,
        organizationId,
        localDate: asDate(row.localDate),
        kcal: row.kcal,
        choG: row.choG,
        proteinG: row.proteinG,
        fatG: row.fatG,
        fiberG: row.fiberG,
        targetKcal: row.targetKcal,
        targetChoG: row.targetChoG,
        targetProteinG: row.targetProteinG,
        targetFatG: row.targetFatG,
        adequacyKcalPct: row.adequacyKcalPct,
        adequacyChoPct: row.adequacyChoPct,
        adequacyProteinPct: row.adequacyProteinPct,
        adequacyFatPct: row.adequacyFatPct,
        kcalInRange: row.kcalInRange,
        mealsLogged: row.mealsLogged,
        mealsPlanned: row.mealsPlanned,
        offPlanItems: row.offPlanItems,
        waterMl: row.waterMl,
        waterTargetMl: row.waterTargetMl,
        workoutsDone: row.workoutsDone,
        workoutsPlanned: row.workoutsPlanned,
        tonnageKg: row.tonnageKg,
        effectiveSets: row.effectiveSets,
        stress: row.stress,
        sleepHours: row.sleepHours,
        energy: row.energy,
        bodyWeightKg: row.bodyWeightKg,
        mealSlots: Object.fromEntries(
          Object.entries(row.mealSlots).map(([code, slot]) => [
            code,
            { planned: slot.planned, logged: slot.logged },
          ]),
        ),
        nutrientsMissing: Object.fromEntries(
          Object.entries(row.nutrientsMissing).map(([key, value]) => [
            MISSING_COLUMN[key as SummaryNutrient | 'items'],
            value,
          ]),
        ),
      })),
    });
  }

  async deleteDailySummaries(patientId: string): Promise<void> {
    await this.db.tx.patientDailySummary.deleteMany({ where: { patientId } });
  }

  async dailySummaries(
    patientId: string,
    from: string,
    to: string,
  ): Promise<readonly DailySummary[]> {
    const rows = await this.db.tx.patientDailySummary.findMany({
      where: { patientId, localDate: { gte: asDate(from), lte: asDate(to) } },
      orderBy: { localDate: 'asc' },
    });
    return rows.map((row) => ({
      localDate: isoDate(row.localDate),
      kcal: num(row.kcal),
      choG: num(row.choG),
      proteinG: num(row.proteinG),
      fatG: num(row.fatG),
      fiberG: num(row.fiberG),
      targetKcal: num(row.targetKcal),
      targetChoG: num(row.targetChoG),
      targetProteinG: num(row.targetProteinG),
      targetFatG: num(row.targetFatG),
      adequacyKcalPct: num(row.adequacyKcalPct),
      adequacyChoPct: num(row.adequacyChoPct),
      adequacyProteinPct: num(row.adequacyProteinPct),
      adequacyFatPct: num(row.adequacyFatPct),
      kcalInRange: row.kcalInRange,
      mealsLogged: row.mealsLogged ?? 0,
      mealsPlanned: row.mealsPlanned,
      offPlanItems: row.offPlanItems ?? 0,
      waterMl: row.waterMl,
      waterTargetMl: row.waterTargetMl,
      workoutsDone: row.workoutsDone ?? 0,
      workoutsPlanned: row.workoutsPlanned,
      tonnageKg: num(row.tonnageKg),
      effectiveSets: num(row.effectiveSets),
      stress: row.stress,
      sleepHours: num(row.sleepHours),
      energy: row.energy,
      bodyWeightKg: num(row.bodyWeightKg),
      mealSlots: mealSlotsOf(row.mealSlots),
      nutrientsMissing: {
        items: countAt(row.nutrientsMissing, 'items'),
        ...(Object.fromEntries(
          SUMMARY_NUTRIENTS.map((key) => [key, countAt(row.nutrientsMissing, MISSING_COLUMN[key])]),
        ) as Record<SummaryNutrient, number>),
      },
    }));
  }
}
