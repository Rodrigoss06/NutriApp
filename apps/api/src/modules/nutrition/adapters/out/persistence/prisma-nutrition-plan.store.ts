import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  ID_GENERATOR,
  type IdGenerator,
  type OrganizationId,
  type UserId,
} from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type { TimelineCursor, TimelineEntry } from '../../../../clinical/index.js';
import type { PlanSnapshot } from '../../../application/plan-document.js';
import type {
  NewNutritionPlan,
  NutritionPlanRecord,
  NutritionPlanStore,
  NutritionPlanSummary,
  PlanContent,
} from '../../../application/ports/nutrition.ports.js';
import type {
  CompositionDraft,
  FoodItem,
  MealHeader,
  MenuItem,
  PlanDraft,
  WeeklyMenuDraft,
} from '../../../domain/food-plan.js';
import {
  EXCHANGE_GROUP_CODES,
  type AllowedFoodDraft,
  type ExchangeGroupCode,
  type ExchangePlan,
  type FixedGroup,
  type MealSlotCode,
  type PlanDraftInput,
  type PlanModality,
  type PlanStatus,
  type SolvedGroup,
} from '../../../domain/nutrition-plan.js';

interface PlanRow {
  id: string;
  organization_id: string;
  patient_id: string;
  lineage_id: string;
  version_no: number;
  modality: PlanModality;
  status: PlanStatus;
  energy_prescription_id: string;
  exchange_list_id: string | null;
  exchange_list_version: string | null;
  target_kcal: number;
  hydration_target_ml: number | null;
  instructions: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  valid_from: string | null;
  version: number;
}

interface MealRow {
  id: string;
  slot_code: MealSlotCode;
  name_es: string;
  time_of_day: string | null;
  share_pct: number;
  day_of_week: number | null;
}

interface ItemRow {
  plan_meal_id: string;
  item_type: 'FOOD' | 'RECIPE';
  item_id: string;
  grams: number | null;
  servings: number | null;
  household_text: string | null;
  option_label: 'A' | 'B' | null;
}

/** Un alimento o receta a guardar, con su tiempo, su opción y su orden. */
interface ItemToSave {
  readonly mealId: string;
  readonly item: MenuItem;
  readonly option: 'A' | 'B' | null;
  readonly position: number;
}

const summaryOf = (row: PlanRow): NutritionPlanSummary => ({
  id: row.id,
  organizationId: row.organization_id as OrganizationId,
  patientId: row.patient_id,
  lineageId: row.lineage_id,
  versionNo: row.version_no,
  modality: row.modality,
  status: row.status,
  energyPrescriptionId: row.energy_prescription_id,
  exchangeListId: row.exchange_list_id,
  exchangeListVersion: row.exchange_list_version,
  targetKcal: row.target_kcal,
  createdAt: row.created_at,
  publishedAt: row.published_at,
  validFrom: row.valid_from,
});

const headerOf = (meal: MealRow): MealHeader => ({
  slotCode: meal.slot_code,
  name: meal.name_es,
  timeOfDay: meal.time_of_day,
  sharePct: meal.share_pct,
});

const itemOf = (row: ItemRow): MenuItem =>
  row.item_type === 'FOOD'
    ? {
        itemType: 'FOOD',
        foodId: row.item_id,
        grams: row.grams ?? 0,
        householdText: row.household_text,
      }
    : { itemType: 'RECIPE', recipeId: row.item_id, servings: row.servings ?? 0 };

const isFixed = (code: ExchangeGroupCode): code is FixedGroup =>
  code === 'VEG' || code === 'FRU' || code === 'MILK';

/** Lo que el plan guarda en sus columnas, de cualquier modalidad. */
const columnsOf = (content: PlanContent) => ({
  hydrationTargetMl: content.plan.hydrationTargetMl,
  instructions: content.plan.instructions,
});

/**
 * nutrition.plan de cualquier modalidad con la transacción de la UnitOfWork. Guardar un borrador reemplaza sus hijos;
 * la base rechaza tocar los de un plan que ya no es borrador (RN-E15). Intercambios usa plan_exchange,
 * plan_meal_exchange y plan_meal_allowed_food; composición y menú, plan_item. En el menú, cada tiempo de cada día es
 * un plan_meal con su day_of_week.
 */
@Injectable()
export class PrismaNutritionPlanStore implements NutritionPlanStore {
  constructor(
    @Inject(TransactionHost) private readonly db: Db,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async insert(plan: NewNutritionPlan, content: PlanContent): Promise<void> {
    const { targets } = plan;
    const { hydrationTargetMl, instructions } = columnsOf(content);
    await this.db.tx.$executeRaw`
      INSERT INTO nutrition.plan (id, organization_id, patient_id, lineage_id, version_no, modality, status,
                                  energy_prescription_id, exchange_list_id, exchange_list_version, target_kcal,
                                  target_cho_g, target_protein_g, target_fat_g, hydration_target_ml, instructions,
                                  created_by, created_at, updated_at)
      VALUES (${plan.id}::uuid, ${plan.organizationId}::uuid, ${plan.patientId}::uuid, ${plan.lineageId}::uuid,
              ${plan.versionNo}, ${content.modality}, 'DRAFT', ${plan.energyPrescriptionId}::uuid,
              ${plan.exchangeListId}::uuid, ${plan.exchangeListVersion}, round(${targets.kcal}::numeric, 1),
              round(${targets.choG}::numeric, 1), round(${targets.proteinG}::numeric, 1),
              round(${targets.fatG}::numeric, 1), ${hydrationTargetMl}, ${instructions},
              ${plan.createdBy}::uuid, ${plan.now}, ${plan.now})`;
    await this.#children(plan.id, plan.organizationId, content);
  }

  async replaceDraft(
    id: string,
    version: number,
    content: PlanContent,
    now: Date,
  ): Promise<boolean> {
    const { hydrationTargetMl, instructions } = columnsOf(content);
    const [row] = await this.db.tx.$queryRaw<{ organization_id: string }[]>`
      UPDATE nutrition.plan
      SET hydration_target_ml = ${hydrationTargetMl}, instructions = ${instructions},
          version = version + 1, updated_at = ${now}
      WHERE id = ${id}::uuid AND version = ${version} AND status = 'DRAFT' AND modality = ${content.modality}
      RETURNING organization_id`;
    if (!row) return false;
    // Borrar un tiempo de comida borra en cascada su reparto, sus alimentos permitidos y sus alimentos o recetas.
    await this.db.tx.$executeRaw`DELETE FROM nutrition.plan_meal WHERE plan_id = ${id}::uuid`;
    await this.db.tx.$executeRaw`DELETE FROM nutrition.plan_exchange WHERE plan_id = ${id}::uuid`;
    await this.#children(id, row.organization_id, content);
    return true;
  }

  async find(id: string): Promise<NutritionPlanRecord | null> {
    const [plan] = await this.db.tx.$queryRaw<PlanRow[]>`
      SELECT id, organization_id, patient_id, lineage_id, version_no, modality, status, energy_prescription_id,
             exchange_list_id, exchange_list_version, target_kcal::float8 AS target_kcal, hydration_target_ml,
             instructions, created_by, created_at, updated_at, published_at,
             to_char(valid_from, 'YYYY-MM-DD') AS valid_from, version
      FROM nutrition.plan WHERE id = ${id}::uuid`;
    if (!plan) return null;
    const meals = await this.db.tx.$queryRaw<MealRow[]>`
      SELECT id, slot_code, name_es, to_char(time_of_day, 'HH24:MI') AS time_of_day, share_pct::float8 AS share_pct,
             day_of_week
      FROM nutrition.plan_meal WHERE plan_id = ${id}::uuid ORDER BY day_of_week NULLS FIRST, position`;
    const mealIds = meals.map((m) => m.id);
    const draft =
      plan.modality === 'EXCHANGES'
        ? await this.#exchangeDraft(plan, meals)
        : await this.#itemDraft(plan, meals);
    return {
      ...summaryOf(plan),
      draft,
      mealIds,
      createdBy: plan.created_by as UserId,
      updatedAt: plan.updated_at,
      version: plan.version,
    };
  }

  async listByPatient(patientId: string): Promise<readonly NutritionPlanSummary[]> {
    const rows = await this.db.tx.$queryRaw<PlanRow[]>`
      SELECT id, organization_id, patient_id, lineage_id, version_no, modality, status, energy_prescription_id,
             exchange_list_id, exchange_list_version, target_kcal::float8 AS target_kcal, hydration_target_ml,
             instructions, created_by, created_at, updated_at, published_at,
             to_char(valid_from, 'YYYY-MM-DD') AS valid_from, version
      FROM nutrition.plan WHERE patient_id = ${patientId}::uuid
      ORDER BY created_at DESC, id DESC`;
    return rows.map(summaryOf);
  }

  async publish(
    id: string,
    version: number,
    publication: {
      readonly snapshot: PlanSnapshot;
      readonly hash: string;
      readonly publishedAt: Date;
      readonly publishedBy: UserId;
      readonly validFrom: string;
    },
  ): Promise<boolean> {
    const updated = await this.db.tx.$executeRaw`
      UPDATE nutrition.plan
      SET status = 'PUBLISHED', snapshot = ${JSON.stringify(publication.snapshot)}::jsonb,
          snapshot_schema_version = ${publication.snapshot.schemaVersion},
          snapshot_hash = decode(${publication.hash}, 'hex'), published_at = ${publication.publishedAt},
          published_by = ${publication.publishedBy}::uuid, valid_from = ${publication.validFrom}::date,
          version = version + 1, updated_at = ${publication.publishedAt}
      WHERE id = ${id}::uuid AND version = ${version} AND status = 'DRAFT'`;
    return updated === 1;
  }

  /** El disparador del plan deja pasar de PUBLISHED a SUPERSEDED cambiando solo estado, versión y fecha. */
  async supersedePublished(patientId: string, now: Date): Promise<string | null> {
    const [row] = await this.db.tx.$queryRaw<{ id: string }[]>`
      UPDATE nutrition.plan SET status = 'SUPERSEDED', version = version + 1, updated_at = ${now}
      WHERE patient_id = ${patientId}::uuid AND status = 'PUBLISHED'
      RETURNING id`;
    return row?.id ?? null;
  }

  async snapshot(id: string): Promise<PlanSnapshot | null> {
    const [row] = await this.db.tx.$queryRaw<{ snapshot: PlanSnapshot }[]>`
      SELECT snapshot FROM nutrition.plan WHERE id = ${id}::uuid AND status <> 'DRAFT'`;
    return row?.snapshot ?? null;
  }

  async lineage(
    lineageId: string,
  ): Promise<{ readonly lastVersionNo: number; readonly draftId: string | null }> {
    const [row] = await this.db.tx.$queryRaw<{ last: number; draft: string | null }[]>`
      SELECT max(version_no)::int AS last, (array_agg(id) FILTER (WHERE status = 'DRAFT'))[1] AS draft
      FROM nutrition.plan WHERE lineage_id = ${lineageId}::uuid`;
    return { lastVersionNo: row?.last ?? 0, draftId: row?.draft ?? null };
  }

  async timeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    const rows = await this.db.tx.$queryRaw<
      { id: string; published_at: Date; version_no: number }[]
    >`
      SELECT id, published_at, version_no FROM nutrition.plan
      WHERE patient_id = ${patientId}::uuid AND published_at IS NOT NULL
        AND (${before?.occurredAt ?? null}::timestamptz IS NULL
             OR (published_at, id) < (${before?.occurredAt ?? null}::timestamptz, ${before?.refId ?? null}::uuid))
      ORDER BY published_at DESC, id DESC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      kind: 'NUTRITION_PLAN_PUBLISHED',
      occurredAt: row.published_at,
      refId: row.id,
      label: String(row.version_no),
      detail: null,
    }));
  }

  /** Un plan por intercambios desde sus filas: grupos fijos y ajustes, reparto a mano y alimentos permitidos. */
  async #exchangeDraft(plan: PlanRow, meals: readonly MealRow[]): Promise<PlanDraft> {
    const mealIds = meals.map((m) => m.id);
    const exchanges = await this.db.tx.$queryRaw<
      { group_code: ExchangeGroupCode; servings: number; is_manual: boolean }[]
    >`SELECT group_code, servings, is_manual FROM nutrition.plan_exchange WHERE plan_id = ${plan.id}::uuid`;
    const cells = await this.db.tx.$queryRaw<
      {
        plan_meal_id: string;
        group_code: ExchangeGroupCode;
        servings: number;
        is_manual: boolean;
      }[]
    >`
      SELECT plan_meal_id, group_code, servings, is_manual FROM nutrition.plan_meal_exchange
      WHERE plan_meal_id = ANY(${mealIds}::uuid[])`;
    const foods = await this.db.tx.$queryRaw<
      {
        plan_meal_id: string;
        group_code: ExchangeGroupCode;
        food_id: string;
        grams: number;
        household_text: string | null;
      }[]
    >`
      SELECT plan_meal_id, group_code, food_id, grams::float8 AS grams, household_text
      FROM nutrition.plan_meal_allowed_food WHERE plan_meal_id = ANY(${mealIds}::uuid[])
      ORDER BY position`;

    const servingsOf = (code: ExchangeGroupCode) =>
      exchanges.find((e) => e.group_code === code)?.servings ?? 0;
    const overrides: Partial<Record<SolvedGroup, number>> = {};
    for (const e of exchanges) {
      if (e.is_manual && !isFixed(e.group_code)) overrides[e.group_code] = e.servings;
    }
    const splitOverrides: Partial<Record<ExchangeGroupCode, number[]>> = {};
    for (const code of EXCHANGE_GROUP_CODES) {
      if (cells.some((c) => c.group_code === code && c.is_manual)) {
        splitOverrides[code] = mealIds.map(
          (mealId) =>
            cells.find((c) => c.plan_meal_id === mealId && c.group_code === code)?.servings ?? 0,
        );
      }
    }
    const draft: PlanDraftInput = {
      fixedServings: { VEG: servingsOf('VEG'), FRU: servingsOf('FRU'), MILK: servingsOf('MILK') },
      overrides,
      meals: meals.map((meal) => ({
        ...headerOf(meal),
        allowedFoods: foods
          .filter((f) => f.plan_meal_id === meal.id)
          .map((f): AllowedFoodDraft => ({
            groupCode: f.group_code,
            foodId: f.food_id,
            grams: f.grams,
            householdText: f.household_text,
          })),
      })),
      splitOverrides,
      hydrationTargetMl: plan.hydration_target_ml,
      instructions: plan.instructions,
    };
    return { modality: 'EXCHANGES', ...draft };
  }

  /** Composición o menú desde sus filas: los tiempos y, en cada uno, sus alimentos o recetas en orden. */
  async #itemDraft(plan: PlanRow, meals: readonly MealRow[]): Promise<PlanDraft> {
    const items = await this.db.tx.$queryRaw<ItemRow[]>`
      SELECT plan_meal_id, item_type, item_id, grams::float8 AS grams, servings::float8 AS servings, household_text,
             option_label
      FROM nutrition.plan_item WHERE plan_meal_id = ANY(${meals.map((m) => m.id)}::uuid[])
      ORDER BY position`;
    const itemsOf = (mealId: string, option: 'A' | 'B' | null) =>
      items.filter((i) => i.plan_meal_id === mealId && i.option_label === option).map(itemOf);
    const common = {
      hydrationTargetMl: plan.hydration_target_ml,
      instructions: plan.instructions,
    };
    if (plan.modality === 'COMPOSITION') {
      const draft: CompositionDraft = {
        ...common,
        meals: meals.map((meal) => ({
          ...headerOf(meal),
          items: itemsOf(meal.id, null).filter((i): i is FoodItem => i.itemType === 'FOOD'),
        })),
      };
      return { modality: 'COMPOSITION', ...draft };
    }
    const byDay = (day: number) => meals.filter((m) => m.day_of_week === day);
    const draft: WeeklyMenuDraft = {
      ...common,
      meals: byDay(1).map(headerOf),
      days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
        meals: byDay(day).map((meal) => ({
          optionA: itemsOf(meal.id, 'A'),
          optionB: itemsOf(meal.id, 'B'),
        })),
      })),
    };
    return { modality: 'WEEKLY_MENU', ...draft };
  }

  /** Los hijos del plan en sentencias con unnest, según su modalidad. */
  async #children(planId: string, organizationId: string, content: PlanContent): Promise<void> {
    if (content.modality === 'EXCHANGES') {
      await this.#exchangeChildren(planId, organizationId, content.plan);
      return;
    }
    if (content.modality === 'COMPOSITION') {
      const mealIds = await this.#meals(
        planId,
        organizationId,
        content.plan.meals.map((meal) => ({ meal, day: null })),
      );
      await this.#items(
        organizationId,
        content.plan.meals.flatMap((meal, m) =>
          meal.items.map((item, position) => ({
            mealId: mealIds[m] ?? '',
            item,
            option: null,
            position: position + 1,
          })),
        ),
      );
      return;
    }
    const { meals, days } = content.plan;
    const mealIds = await this.#meals(
      planId,
      organizationId,
      days.flatMap((_, d) => meals.map((meal) => ({ meal, day: d + 1 }))),
    );
    await this.#items(
      organizationId,
      days.flatMap((day, d) =>
        day.meals.flatMap((cell, m) => {
          const mealId = mealIds[d * meals.length + m] ?? '';
          return [
            ...cell.optionA.map((item, i) => ({
              mealId,
              item,
              option: 'A' as const,
              position: i + 1,
            })),
            ...cell.optionB.map((item, i) => ({
              mealId,
              item,
              option: 'B' as const,
              position: i + 1,
            })),
          ];
        }),
      ),
    );
  }

  /** Tiempos de comida; en el menú, uno por tiempo y día. Devuelve sus id en el orden dado. */
  async #meals(
    planId: string,
    organizationId: string,
    rows: readonly { readonly meal: MealHeader; readonly day: number | null }[],
  ): Promise<readonly string[]> {
    const ids = rows.map(() => this.ids.newId<'PlanMealId'>());
    const perDay = new Map<number | null, number>();
    const positions = rows.map(({ day }) => {
      const next = (perDay.get(day) ?? 0) + 1;
      perDay.set(day, next);
      return next;
    });
    await this.db.tx.$executeRaw`
      INSERT INTO nutrition.plan_meal (id, plan_id, organization_id, slot_code, name_es, time_of_day, position,
                                       share_pct, day_of_week)
      SELECT m.id, ${planId}::uuid, ${organizationId}::uuid, m.slot, m.name, m.time::time, m.position, m.share, m.day
      FROM unnest(${ids}::uuid[], ${rows.map((r) => r.meal.slotCode)}::text[],
                  ${rows.map((r) => r.meal.name)}::text[], ${rows.map((r) => r.meal.timeOfDay)}::text[],
                  ${positions}::smallint[], ${rows.map((r) => r.meal.sharePct)}::numeric[],
                  ${rows.map((r) => r.day)}::smallint[])
        AS m(id, slot, name, time, position, share, day)`;
    return ids;
  }

  async #items(organizationId: string, rows: readonly ItemToSave[]): Promise<void> {
    if (rows.length === 0) return;
    const food = (row: ItemToSave) => (row.item.itemType === 'FOOD' ? row.item : null);
    const recipe = (row: ItemToSave) => (row.item.itemType === 'RECIPE' ? row.item : null);
    await this.db.tx.$executeRaw`
      INSERT INTO nutrition.plan_item (id, plan_meal_id, organization_id, item_type, item_id, grams, servings,
                                       household_text, option_label, position)
      SELECT i.id, i.meal, ${organizationId}::uuid, i.type, i.item, i.grams, i.servings, i.household, i.option,
             i.position
      FROM unnest(${rows.map(() => this.ids.newId<'PlanItemId'>())}::uuid[], ${rows.map((r) => r.mealId)}::uuid[],
                  ${rows.map((r) => r.item.itemType)}::text[],
                  ${rows.map((r) => food(r)?.foodId ?? recipe(r)?.recipeId ?? '')}::uuid[],
                  ${rows.map((r) => food(r)?.grams ?? null)}::numeric[],
                  ${rows.map((r) => recipe(r)?.servings ?? null)}::numeric[],
                  ${rows.map((r) => food(r)?.householdText ?? null)}::text[], ${rows.map((r) => r.option)}::text[],
                  ${rows.map((r) => r.position)}::smallint[])
        AS i(id, meal, type, item, grams, servings, household, option, position)`;
  }

  /** Intercambios del día, tiempos, su reparto y sus alimentos permitidos. */
  async #exchangeChildren(
    planId: string,
    organizationId: string,
    content: ExchangePlan,
  ): Promise<void> {
    const manualSplit = new Set(content.manualSplit);
    await this.db.tx.$executeRaw`
      INSERT INTO nutrition.plan_exchange (plan_id, group_code, organization_id, servings, is_manual)
      SELECT ${planId}::uuid, e.code, ${organizationId}::uuid, e.servings, e.manual
      FROM unnest(${content.exchanges.map((e) => e.groupCode)}::text[],
                  ${content.exchanges.map((e) => e.servings)}::int[],
                  ${content.exchanges.map((e) => e.manual)}::boolean[]) AS e(code, servings, manual)`;
    const mealIds = await this.#meals(
      planId,
      organizationId,
      content.meals.map((meal) => ({ meal, day: null })),
    );
    const cells = content.meals.flatMap((meal, i) =>
      EXCHANGE_GROUP_CODES.map((code) => ({
        mealId: mealIds[i] ?? '',
        code,
        servings: meal.servings[code],
        manual: manualSplit.has(code),
      })),
    );
    await this.db.tx.$executeRaw`
      INSERT INTO nutrition.plan_meal_exchange (plan_meal_id, group_code, organization_id, servings, is_manual)
      SELECT c.meal, c.code, ${organizationId}::uuid, c.servings, c.manual
      FROM unnest(${cells.map((c) => c.mealId)}::uuid[], ${cells.map((c) => c.code)}::text[],
                  ${cells.map((c) => c.servings)}::int[], ${cells.map((c) => c.manual)}::boolean[])
        AS c(meal, code, servings, manual)`;
    const foods = content.meals.flatMap((meal, i) =>
      meal.allowedFoods.map((food, position) => ({ ...food, mealId: mealIds[i] ?? '', position })),
    );
    if (foods.length === 0) return;
    await this.db.tx.$executeRaw`
      INSERT INTO nutrition.plan_meal_allowed_food (plan_meal_id, group_code, food_id, organization_id, grams,
                                                    household_text, position)
      SELECT f.meal, f.code, f.food, ${organizationId}::uuid, f.grams, f.household, f.position
      FROM unnest(${foods.map((f) => f.mealId)}::uuid[], ${foods.map((f) => f.groupCode)}::text[],
                  ${foods.map((f) => f.foodId)}::uuid[], ${foods.map((f) => f.grams)}::numeric[],
                  ${foods.map((f) => f.householdText)}::text[], ${foods.map((f) => f.position)}::smallint[])
        AS f(meal, code, food, grams, household, position)`;
  }
}
