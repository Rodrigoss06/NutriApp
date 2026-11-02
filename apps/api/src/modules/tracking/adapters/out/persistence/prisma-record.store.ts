import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  ActiveSnapshot,
  DayTargetRow,
  NewFoodLog,
  NewRecord,
  RecordStatus,
  RecordStore,
  StoredFoodLog,
  StoredHydrationLog,
  StoredMetric,
  StoredNote,
} from '../../../application/ports/records.ports.js';
import type { FoodLogDraft } from '../../../domain/records.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

const FOOD_LOG = {
  id: true,
  clientId: true,
  localDate: true,
  loggedAt: true,
  mealSlotCode: true,
  planId: true,
  itemType: true,
  itemName: true,
  exchangeGroupCode: true,
  servings: true,
  grams: true,
  householdText: true,
  kcal: true,
  choG: true,
  proteinG: true,
  fatG: true,
  inPlan: true,
  status: true,
} as const;

interface FoodLogModel {
  readonly id: string;
  readonly clientId: string;
  readonly localDate: Date;
  readonly loggedAt: Date;
  readonly mealSlotCode: string;
  readonly planId: string | null;
  readonly itemType: string;
  readonly itemName: string;
  readonly exchangeGroupCode: string | null;
  readonly servings: { toString(): string } | null;
  readonly grams: { toString(): string } | null;
  readonly householdText: string | null;
  readonly kcal: { toString(): string } | null;
  readonly choG: { toString(): string } | null;
  readonly proteinG: { toString(): string } | null;
  readonly fatG: { toString(): string } | null;
  readonly inPlan: boolean;
  readonly status: string;
}

const toFoodLog = (row: FoodLogModel): StoredFoodLog => ({
  id: row.id,
  clientId: row.clientId,
  localDate: isoDate(row.localDate),
  loggedAt: row.loggedAt,
  mealSlotCode: row.mealSlotCode,
  planId: row.planId,
  itemType: row.itemType as FoodLogDraft['itemType'],
  itemName: row.itemName,
  exchangeGroupCode: row.exchangeGroupCode,
  servings: num(row.servings),
  grams: num(row.grams),
  householdText: row.householdText,
  kcal: num(row.kcal),
  choG: num(row.choG),
  proteinG: num(row.proteinG),
  fatG: num(row.fatG),
  inPlan: row.inPlan,
  status: row.status as RecordStatus,
});

const HYDRATION = {
  id: true,
  clientId: true,
  localDate: true,
  loggedAt: true,
  volumeMl: true,
  status: true,
} as const;

const toHydration = (row: {
  id: string;
  clientId: string;
  localDate: Date;
  loggedAt: Date;
  volumeMl: number;
  status: string;
}): StoredHydrationLog => ({
  ...row,
  localDate: isoDate(row.localDate),
  status: row.status as RecordStatus,
});

const NOTE = { id: true, clientId: true, localDate: true, body: true, createdAt: true } as const;

const toNote = (row: {
  id: string;
  clientId: string;
  localDate: Date;
  body: string;
  createdAt: Date;
}): StoredNote => ({ ...row, localDate: isoDate(row.localDate) });

const METRIC = {
  id: true,
  clientId: true,
  localDate: true,
  metricCode: true,
  value: true,
  status: true,
} as const;

const toMetric = (row: {
  id: string;
  clientId: string;
  localDate: Date;
  metricCode: string;
  value: { toString(): string };
  status: string;
}): StoredMetric => ({
  ...row,
  localDate: isoDate(row.localDate),
  value: Number(row.value),
  status: row.status as RecordStatus,
});

const base = (row: NewRecord) => ({
  id: row.id,
  organizationId: row.organizationId,
  patientId: row.patientId,
  localDate: asDate(row.localDate),
  clientId: row.clientId,
});

/** Una fecha del snapshot: YYYY-MM-DD o null. */
const snapshotDate = (snapshot: unknown, key: string): string | null => {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.slice(0, 10) : null;
};

/**
 * Los registros del paciente con Prisma, en la transacción de la UnitOfWork: la RLS deja al paciente solo lo suyo (RN-G01). Las
 * inserciones no duplican un clientId (ON CONFLICT DO NOTHING sobre los índices *_idem, RN-G08) y anular solo cambia el estado:
 * app_user no tiene otro UPDATE en tracking (RN-G12).
 */
@Injectable()
export class PrismaRecordStore implements RecordStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async insertFoodLogs(rows: readonly NewFoodLog[]): Promise<void> {
    await this.db.tx.foodLog.createMany({
      data: rows.map((row) => ({
        ...base(row),
        loggedAt: row.loggedAt,
        mealSlotCode: row.draft.mealSlotCode,
        planId: row.planId,
        planMealId: row.draft.planMealId,
        itemType: row.draft.itemType,
        itemId: row.draft.itemId,
        itemName: row.draft.itemName,
        exchangeGroupCode: row.draft.exchangeGroupCode,
        servings: row.draft.servings,
        grams: row.draft.grams,
        householdText: row.draft.householdText,
        kcal: row.draft.nutrients.kcal,
        choG: row.draft.nutrients.choG,
        proteinG: row.draft.nutrients.proteinG,
        fatG: row.draft.nutrients.fatG,
        nutrients: row.draft.nutrients.micronutrients,
        inPlan: row.draft.inPlan,
        createdBy: row.createdBy,
      })),
      skipDuplicates: true,
    });
  }

  async foodLogsByClientIds(
    patientId: string,
    localDate: string,
    clientIds: readonly string[],
  ): Promise<readonly StoredFoodLog[]> {
    const rows = await this.db.tx.foodLog.findMany({
      where: { patientId, localDate: asDate(localDate), clientId: { in: [...clientIds] } },
      select: FOOD_LOG,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toFoodLog);
  }

  async foodLog(id: string): Promise<StoredFoodLog | null> {
    const row = await this.db.tx.foodLog.findFirst({ where: { id }, select: FOOD_LOG });
    return row ? toFoodLog(row) : null;
  }

  async voidFoodLog(id: string, localDate: string, replacedById: string | null): Promise<void> {
    await this.db.tx.foodLog.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED', replacedById },
    });
  }

  async dayFoodLogs(patientId: string, localDate: string): Promise<readonly StoredFoodLog[]> {
    const rows = await this.db.tx.foodLog.findMany({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: FOOD_LOG,
      orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toFoodLog);
  }

  async insertHydration(
    row: NewRecord & { readonly loggedAt: Date; readonly volumeMl: number },
  ): Promise<void> {
    await this.db.tx.hydrationLog.createMany({
      data: [{ ...base(row), loggedAt: row.loggedAt, volumeMl: row.volumeMl }],
      skipDuplicates: true,
    });
  }

  async hydrationByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredHydrationLog | null> {
    const row = await this.db.tx.hydrationLog.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: HYDRATION,
    });
    return row ? toHydration(row) : null;
  }

  async hydrationLog(id: string): Promise<StoredHydrationLog | null> {
    const row = await this.db.tx.hydrationLog.findFirst({ where: { id }, select: HYDRATION });
    return row ? toHydration(row) : null;
  }

  async voidHydration(id: string, localDate: string): Promise<void> {
    await this.db.tx.hydrationLog.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED' },
    });
  }

  async dayHydration(patientId: string, localDate: string): Promise<readonly StoredHydrationLog[]> {
    const rows = await this.db.tx.hydrationLog.findMany({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: HYDRATION,
      orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toHydration);
  }

  async insertNote(row: NewRecord & { readonly body: string }): Promise<void> {
    await this.db.tx.noteLog.createMany({
      data: [{ ...base(row), body: row.body }],
      skipDuplicates: true,
    });
  }

  async noteByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredNote | null> {
    const row = await this.db.tx.noteLog.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: NOTE,
    });
    return row ? toNote(row) : null;
  }

  async dayNotes(patientId: string, localDate: string): Promise<readonly StoredNote[]> {
    const rows = await this.db.tx.noteLog.findMany({
      where: { patientId, localDate: asDate(localDate) },
      select: NOTE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toNote);
  }

  async insertMetric(
    row: NewRecord & {
      readonly metricCode: string;
      readonly value: number;
      readonly measuredAt: Date;
    },
  ): Promise<void> {
    await this.db.tx.metricLog.createMany({
      data: [
        { ...base(row), metricCode: row.metricCode, value: row.value, measuredAt: row.measuredAt },
      ],
      skipDuplicates: true,
    });
  }

  async metricByClientId(
    patientId: string,
    localDate: string,
    clientId: string,
  ): Promise<StoredMetric | null> {
    const row = await this.db.tx.metricLog.findFirst({
      where: { patientId, localDate: asDate(localDate), clientId },
      select: METRIC,
    });
    return row ? toMetric(row) : null;
  }

  async metricLog(id: string): Promise<StoredMetric | null> {
    const row = await this.db.tx.metricLog.findFirst({ where: { id }, select: METRIC });
    return row ? toMetric(row) : null;
  }

  async voidMetric(id: string, localDate: string): Promise<void> {
    await this.db.tx.metricLog.updateMany({
      where: { id, localDate: asDate(localDate) },
      data: { status: 'VOIDED' },
    });
  }

  async dayMetrics(patientId: string, localDate: string): Promise<readonly StoredMetric[]> {
    const rows = await this.db.tx.metricLog.findMany({
      where: { patientId, localDate: asDate(localDate), status: 'ACTIVE' },
      select: METRIC,
      orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMetric);
  }

  async metricRange(
    code: string,
  ): Promise<{ readonly min: number | null; readonly max: number | null } | null> {
    const row = await this.db.tx.metricDefinition.findFirst({
      where: { code, isActive: true },
      select: { minValue: true, maxValue: true },
    });
    return row ? { min: num(row.minValue), max: num(row.maxValue) } : null;
  }

  /** El plan vigente, desde su validFrom (RN-E14): effective_from es de la fila, que comparten el plan y el programa. */
  async activeNutrition(patientId: string): Promise<ActiveSnapshot | null> {
    const row = await this.db.tx.activePlanView.findUnique({
      where: { patientId },
      select: { nutritionPlanId: true, nutritionSnapshot: true },
    });
    const effectiveFrom = snapshotDate(row?.nutritionSnapshot, 'validFrom');
    return row?.nutritionPlanId && effectiveFrom
      ? { id: row.nutritionPlanId, effectiveFrom, snapshot: row.nutritionSnapshot }
      : null;
  }

  /** El programa vigente, desde su primer día (07 §8). */
  async activeTraining(patientId: string): Promise<ActiveSnapshot | null> {
    const row = await this.db.tx.activePlanView.findUnique({
      where: { patientId },
      select: { trainingProgramId: true, trainingSnapshot: true },
    });
    const effectiveFrom = snapshotDate(row?.trainingSnapshot, 'startDate');
    return row?.trainingProgramId && effectiveFrom
      ? { id: row.trainingProgramId, effectiveFrom, snapshot: row.trainingSnapshot }
      : null;
  }

  async dayTarget(patientId: string, localDate: string): Promise<DayTargetRow | null> {
    const row = await this.db.tx.dailyTarget.findUnique({
      where: { patientId_localDate: { patientId, localDate: asDate(localDate) } },
      select: { kcal: true, choG: true, proteinG: true, fatG: true, waterMl: true },
    });
    if (
      !row ||
      row.kcal === null ||
      row.choG === null ||
      row.proteinG === null ||
      row.fatG === null
    ) {
      return null;
    }
    return {
      kcal: Number(row.kcal),
      choG: Number(row.choG),
      proteinG: Number(row.proteinG),
      fatG: Number(row.fatG),
      waterMl: row.waterMl,
    };
  }
}
