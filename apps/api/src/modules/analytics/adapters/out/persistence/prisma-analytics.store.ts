import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { FATIGUE_FAMILIES, type FamilyVolume } from '@nutricoach/engine';
import type { Db } from '../../../../../platform/index.js';
import type {
  AnalyticsStore,
  OverviewPage,
  OverviewRow,
  WeeklyMuscleRow,
} from '../../../application/ports/analytics.ports.js';
import {
  SUMMARY_NUTRIENTS,
  type DailySummary,
  type MealSlotDay,
  type SummaryNutrient,
} from '../../../domain/daily-summary.js';
import type { OneRmPoint } from '../../../domain/one-rm.js';
import { OVERVIEW_ALERTS, type OverviewAlert } from '../../../domain/overview.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

/** El volumen por familia se guarda como {familia: kg} (P-27.2); al leerlo, en el orden de las familias y sin lo que no es un número. */
const familyColumn = (volumes: readonly FamilyVolume[]): Record<string, number> =>
  Object.fromEntries(volumes.map((item) => [item.family, item.adjustedVolumeKg]));

function familyVolumesOf(value: unknown): readonly FamilyVolume[] | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const column = value as Record<string, unknown>;
  return FATIGUE_FAMILIES.flatMap((family) => {
    const adjustedVolumeKg = column[family];
    return typeof adjustedVolumeKg === 'number' ? [{ family, adjustedVolumeKg }] : [];
  });
}

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
        dayKind: row.dayKind,
        dayProfileCode: row.dayProfileCode,
        dayProfileName: row.dayProfileName,
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
        adjustedVolumeKg: row.adjustedVolumeKg,
        unfactoredSets: row.unfactoredSets,
        effectiveSets: row.effectiveSets,
        srpeLoad: row.srpeLoad,
        cardioMinutes: row.cardioMinutes,
        stress: row.stress,
        sleepHours: row.sleepHours,
        fatigue: row.fatigue,
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
      dayKind: row.dayKind === 'TRAINING' || row.dayKind === 'REST' ? row.dayKind : null,
      dayProfileCode: row.dayProfileCode,
      dayProfileName: row.dayProfileName,
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
      adjustedVolumeKg: num(row.adjustedVolumeKg),
      unfactoredSets: row.unfactoredSets,
      effectiveSets: num(row.effectiveSets),
      srpeLoad: num(row.srpeLoad),
      cardioMinutes: num(row.cardioMinutes),
      stress: row.stress,
      sleepHours: num(row.sleepHours),
      fatigue: row.fatigue,
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

  async replaceWeeklyVolume(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
    rows: readonly WeeklyMuscleRow[],
  ): Promise<void> {
    await this.db.tx.patientWeeklyMuscleVolume.deleteMany({
      where: { patientId, weekStart: { gte: asDate(from), lte: asDate(to) } },
    });
    if (rows.length === 0) return;
    await this.db.tx.patientWeeklyMuscleVolume.createMany({
      data: rows.map((row) => ({
        patientId,
        organizationId,
        weekStart: asDate(row.weekStart),
        muscleCode: row.muscleCode,
        programId: row.programId,
        mesocycleId: row.mesocycleId,
        weekNo: row.weekNo,
        isDeload: row.isDeload,
        fractionalSetsDone: row.fractionalSetsDone,
        fractionalSetsPlanned: row.fractionalSetsPlanned,
        tonnageKg: row.tonnageKg,
        adjustedVolumeKg: row.adjustedVolumeKg,
        unfactoredSets: row.unfactoredSets,
        ...(row.familyVolumes === null
          ? {}
          : { familyAdjustedVolumeKg: familyColumn(row.familyVolumes) }),
        avgRpe: row.avgRpe,
        avgStimulus: row.avgStimulus,
        avgFatigue: row.avgFatigue,
        sfr: row.sfr,
      })),
    });
  }

  async deleteWeeklyVolume(patientId: string): Promise<void> {
    await this.db.tx.patientWeeklyMuscleVolume.deleteMany({ where: { patientId } });
  }

  async weeklyVolume(
    patientId: string,
    from: string,
    to: string,
  ): Promise<readonly WeeklyMuscleRow[]> {
    const rows = await this.db.tx.patientWeeklyMuscleVolume.findMany({
      where: { patientId, weekStart: { gte: asDate(from), lte: asDate(to) } },
      orderBy: [{ weekStart: 'asc' }, { muscleCode: 'asc' }],
    });
    return rows.map((row) => ({
      weekStart: isoDate(row.weekStart),
      muscleCode: row.muscleCode,
      programId: row.programId,
      mesocycleId: row.mesocycleId,
      weekNo: row.weekNo,
      isDeload: row.isDeload,
      fractionalSetsDone: Number(row.fractionalSetsDone),
      fractionalSetsPlanned: num(row.fractionalSetsPlanned),
      tonnageKg: num(row.tonnageKg),
      adjustedVolumeKg: num(row.adjustedVolumeKg),
      unfactoredSets: row.unfactoredSets,
      familyVolumes: familyVolumesOf(row.familyAdjustedVolumeKg),
      avgRpe: num(row.avgRpe),
      avgStimulus: num(row.avgStimulus),
      avgFatigue: num(row.avgFatigue),
      sfr: num(row.sfr),
    }));
  }

  async replaceOneRm(
    organizationId: string,
    patientId: string,
    from: string,
    to: string,
    points: readonly OneRmPoint[],
  ): Promise<void> {
    await this.db.tx.exerciseOneRmSeries.deleteMany({
      where: { patientId, localDate: { gte: asDate(from), lte: asDate(to) } },
    });
    if (points.length === 0) return;
    await this.db.tx.exerciseOneRmSeries.createMany({
      data: points.map((point) => ({
        patientId,
        organizationId,
        exerciseId: point.exerciseId,
        localDate: asDate(point.localDate),
        formula: point.formula,
        bestEstimated1rmKg: point.bestEstimated1rmKg,
        sourceSetId: point.sourceSetId,
      })),
    });
  }

  async deleteOneRm(patientId: string): Promise<void> {
    await this.db.tx.exerciseOneRmSeries.deleteMany({ where: { patientId } });
  }

  async oneRmSeries(patientId: string, from: string, to: string): Promise<readonly OneRmPoint[]> {
    const rows = await this.db.tx.exerciseOneRmSeries.findMany({
      where: { patientId, localDate: { gte: asDate(from), lte: asDate(to) } },
      orderBy: [{ exerciseId: 'asc' }, { formula: 'asc' }, { localDate: 'asc' }],
    });
    return rows.map((row) => ({
      localDate: isoDate(row.localDate),
      exerciseId: row.exerciseId,
      formula: row.formula,
      bestEstimated1rmKg: Number(row.bestEstimated1rmKg),
      sourceSetId: row.sourceSetId,
    }));
  }

  async replaceOverview(organizationId: string, row: OverviewRow): Promise<void> {
    const values = {
      lastLogDate: row.lastLogDate === null ? null : asDate(row.lastLogDate),
      lastEvaluationAt: row.lastEvaluationAt,
      lastWeightKg: row.lastWeightKg,
      adherence7dPct: row.adherence7dPct,
      adherence30dPct: row.adherence30dPct,
      unreadNotes: row.unreadNotes,
      alerts: [...row.alerts],
      updatedAt: row.updatedAt,
    };
    await this.db.tx.patientOverview.upsert({
      where: { patientId: row.patientId },
      create: { patientId: row.patientId, organizationId, ...values },
      update: values,
    });
  }

  async deleteOverview(patientId: string): Promise<void> {
    await this.db.tx.patientOverview.deleteMany({ where: { patientId } });
  }

  async overviewPage(alert: OverviewAlert | null, limit: number): Promise<OverviewPage> {
    const tallies = await this.db.tx.$queryRaw<{ alert: string; patients: bigint }[]>`
      SELECT alert, count(*) AS patients
      FROM analytics.patient_overview, unnest(alerts) AS alert
      GROUP BY alert`;
    const counts = Object.fromEntries(OVERVIEW_ALERTS.map((code) => [code, 0])) as Record<
      OverviewAlert,
      number
    >;
    for (const tally of tallies) {
      if ((OVERVIEW_ALERTS as readonly string[]).includes(tally.alert)) {
        counts[tally.alert as OverviewAlert] = Number(tally.patients);
      }
    }
    const [total] = await this.db.tx.$queryRaw<{ patients: bigint }[]>`
      SELECT count(*) AS patients FROM analytics.patient_overview
      WHERE cardinality(alerts) > 0 AND (${alert}::text IS NULL OR ${alert}::text = ANY(alerts))`;
    const rows = await this.db.tx.$queryRaw<
      {
        patient_id: string;
        last_log_date: Date | null;
        last_evaluation_at: Date | null;
        last_weight_kg: { toString(): string } | null;
        adherence_7d_pct: { toString(): string } | null;
        adherence_30d_pct: { toString(): string } | null;
        unread_notes: number;
        alerts: string[];
        updated_at: Date;
      }[]
    >`
      SELECT patient_id, last_log_date, last_evaluation_at, last_weight_kg, adherence_7d_pct, adherence_30d_pct,
             unread_notes, alerts, updated_at
      FROM analytics.patient_overview
      WHERE cardinality(alerts) > 0 AND (${alert}::text IS NULL OR ${alert}::text = ANY(alerts))
      ORDER BY cardinality(alerts) DESC, last_log_date ASC NULLS FIRST, patient_id
      LIMIT ${limit}`;
    return {
      counts,
      total: Number(total?.patients ?? 0),
      rows: rows.map((row) => ({
        patientId: row.patient_id,
        lastLogDate: row.last_log_date ? isoDate(row.last_log_date) : null,
        lastEvaluationAt: row.last_evaluation_at,
        lastWeightKg: num(row.last_weight_kg),
        adherence7dPct: num(row.adherence_7d_pct),
        adherence30dPct: num(row.adherence_30d_pct),
        unreadNotes: row.unread_notes,
        alerts: row.alerts.filter((code): code is OverviewAlert =>
          (OVERVIEW_ALERTS as readonly string[]).includes(code),
        ),
        updatedAt: row.updated_at,
      })),
    };
  }
}
