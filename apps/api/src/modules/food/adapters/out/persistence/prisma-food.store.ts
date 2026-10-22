import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ID_GENERATOR, type IdGenerator } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  CatalogNutrient,
  ExchangeListRecord,
  FoodRecord,
  FoodSearch,
  FoodStore,
  FoodSummaryRecord,
  NewOwnFood,
} from '../../../application/ports/food.port.js';
import type { NutrientUnit, ValueFlag } from '../../../domain/catalog-food.js';
import type { FoodState } from '../../../domain/food-state.js';
import type { OwnFood } from '../../../domain/own-food.js';

interface SummaryRow {
  id: string;
  name_es: string;
  source_code: string;
  source_food_code: string | null;
  group_name: string | null;
  state: FoodState;
  own: boolean;
  kcal: number | null;
  score: number;
}

const toSummary = (row: SummaryRow): FoodSummaryRecord => ({
  id: row.id,
  name: row.name_es,
  sourceCode: row.source_code,
  sourceFoodCode: row.source_food_code,
  groupName: row.group_name,
  state: row.state,
  own: row.own,
  energyKcalPer100g: row.kcal,
  score: row.score,
});

/**
 * food.food y sus tablas con la transacción de la UnitOfWork. La RLS deja ver los alimentos globales y los de la
 * organización activa, y escribir solo los propios (RN-I01).
 */
@Injectable()
export class PrismaFoodStore implements FoodStore {
  constructor(
    @Inject(TransactionHost) private readonly db: Db,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /**
   * Sin tildes ni mayúsculas (search_text). Entra el alimento que tiene todas las palabras del término o se le parece
   * palabra por palabra (pg_trgm, umbral 0.6). Primero los que empiezan con el término, después los que lo contienen
   * entero, los del estado pedido, los más parecidos y los de nombre más corto.
   */
  async search({ text, state, limit }: FoodSearch): Promise<readonly FoodSummaryRecord[]> {
    const rows = await this.db.tx.$queryRaw<SummaryRow[]>`
      WITH q AS (SELECT app.unaccent_immutable(lower(${text}::text)) AS t)
      SELECT f.id, f.name_es, f.source_code, f.source_food_code, g.name_es AS group_name, f.state,
             f.organization_id IS NOT NULL AS own, e.value_per_100g::float8 AS kcal,
             coalesce(word_similarity(q.t, f.search_text), 0)::float8 AS score
      FROM food.food f
      CROSS JOIN q
      LEFT JOIN food.food_group g ON g.code = f.group_code
      LEFT JOIN food.food_nutrient e ON e.food_id = f.id AND e.nutrient_code = 'ENERC_KCAL'
      WHERE f.status = 'ACTIVE'
        AND (q.t IS NULL
             OR NOT EXISTS (SELECT 1 FROM unnest(string_to_array(q.t, ' ')) AS word
                            WHERE word <> '' AND f.search_text NOT LIKE '%' || word || '%')
             OR q.t <% f.search_text)
      ORDER BY coalesce(f.search_text LIKE q.t || '%', false) DESC,
               coalesce(f.search_text LIKE '%' || q.t || '%', false) DESC,
               coalesce(f.state = ${state}::text, false) DESC,
               score DESC, length(f.name_es), f.name_es
      LIMIT ${limit}`;
    return rows.map(toSummary);
  }

  async byIds(ids: readonly string[]): Promise<readonly FoodRecord[]> {
    if (ids.length === 0) return [];
    const list = [...ids];
    const foods = await this.db.tx.$queryRaw<
      (SummaryRow & {
        organization_id: string | null;
        edible_portion_pct: number;
        tags: string[];
        version: number;
        source_name: string;
        source_edition: string | null;
      })[]
    >`
      SELECT f.id, f.name_es, f.source_code, f.source_food_code, g.name_es AS group_name, f.state,
             f.organization_id IS NOT NULL AS own, e.value_per_100g::float8 AS kcal, 0::float8 AS score,
             f.organization_id, f.edible_portion_pct::float8 AS edible_portion_pct, f.tags, f.version,
             s.name AS source_name, s.edition AS source_edition
      FROM food.food f
      JOIN food.source s ON s.code = f.source_code
      LEFT JOIN food.food_group g ON g.code = f.group_code
      LEFT JOIN food.food_nutrient e ON e.food_id = f.id AND e.nutrient_code = 'ENERC_KCAL'
      WHERE f.id = ANY(${list}::uuid[])`;
    if (foods.length === 0) return [];
    const found = foods.map((f) => f.id);
    const nutrients = await this.db.tx.$queryRaw<
      {
        food_id: string;
        code: string;
        name_es: string;
        unit: string;
        is_core: boolean;
        value: number | null;
        flag: ValueFlag | null;
      }[]
    >`
      SELECT id AS food_id, n.code, n.name_es, n.unit, n.is_core, fn.value_per_100g::float8 AS value,
             CASE WHEN fn.food_id IS NULL THEN 'MISSING' ELSE fn.value_flag END AS flag
      FROM unnest(${found}::uuid[]) AS id
      CROSS JOIN food.nutrient n
      LEFT JOIN food.food_nutrient fn ON fn.food_id = id AND fn.nutrient_code = n.code
      ORDER BY n.display_order`;
    const measures = await this.db.tx.$queryRaw<
      {
        id: string;
        food_id: string;
        name_es: string;
        grams: number;
        gross_grams: number | null;
        source_code: string | null;
      }[]
    >`
      SELECT id, food_id, name_es, grams::float8 AS grams, gross_grams::float8 AS gross_grams, source_code
      FROM food.household_measure WHERE food_id = ANY(${found}::uuid[])
      ORDER BY source_measure_code IS NULL, length(source_measure_code), source_measure_code, name_es`;
    const factors = await this.db.tx.$queryRaw<
      { id: string; food_id: string; name_es: string; cooking_method_es: string; factor: number }[]
    >`
      SELECT id, food_id, name_es, cooking_method_es, cooked_to_raw_factor::float8 AS factor
      FROM food.cooking_factor WHERE food_id = ANY(${found}::uuid[])
      ORDER BY source_item_code, name_es, cooking_method_es`;

    return foods.map((food) => ({
      ...toSummary(food),
      organizationId: food.organization_id,
      ediblePortionPct: food.edible_portion_pct,
      tags: food.tags,
      version: food.version,
      source: {
        code: food.source_code,
        name: food.source_name,
        edition: food.source_edition,
      },
      nutrients: nutrients
        .filter((n) => n.food_id === food.id)
        .map((n) => ({
          nutrientCode: n.code,
          name: n.name_es,
          unit: n.unit,
          core: n.is_core,
          valuePer100g: n.value,
          flag: n.flag,
        })),
      measures: measures
        .filter((m) => m.food_id === food.id)
        .map((m) => ({
          id: m.id,
          name: m.name_es,
          grams: m.grams,
          grossGrams: m.gross_grams,
          sourceCode: m.source_code,
        })),
      cookingFactors: factors
        .filter((c) => c.food_id === food.id)
        .map((c) => ({
          id: c.id,
          name: c.name_es,
          cookingMethod: c.cooking_method_es,
          cookedToRawFactor: c.factor,
        })),
    }));
  }

  async nutrients(): Promise<readonly CatalogNutrient[]> {
    const rows = await this.db.tx.$queryRaw<
      { code: string; name_es: string; unit: NutrientUnit; is_core: boolean }[]
    >`SELECT code, name_es, unit, is_core FROM food.nutrient ORDER BY display_order`;
    return rows.map((r) => ({ code: r.code, name: r.name_es, unit: r.unit, core: r.is_core }));
  }

  async exchangeLists(): Promise<readonly ExchangeListRecord[]> {
    const lists = await this.db.tx.$queryRaw<
      {
        id: string;
        code: string;
        name: string;
        version: string;
        provisional: boolean;
        license_note: string | null;
      }[]
    >`
      SELECT id, code, name, version, provisional, license_note
      FROM food.exchange_list WHERE status = 'PUBLISHED'
      ORDER BY provisional, name, version`;
    if (lists.length === 0) return [];
    const groups = await this.db.tx.$queryRaw<
      {
        exchange_list_id: string;
        code: string;
        name_es: string;
        cho_g: number;
        protein_g: number;
        fat_g: number;
        kcal: number;
      }[]
    >`
      SELECT exchange_list_id, code, name_es, cho_g::float8 AS cho_g, protein_g::float8 AS protein_g,
             fat_g::float8 AS fat_g, kcal::float8 AS kcal
      FROM food.exchange_group WHERE exchange_list_id = ANY(${lists.map((l) => l.id)}::uuid[])
      ORDER BY display_order, code`;
    return lists.map((list) => ({
      id: list.id,
      code: list.code,
      name: list.name,
      version: list.version,
      provisional: list.provisional,
      note: list.license_note,
      groups: groups
        .filter((g) => g.exchange_list_id === list.id)
        .map((g) => ({
          code: g.code,
          name: g.name_es,
          choG: g.cho_g,
          proteinG: g.protein_g,
          fatG: g.fat_g,
          kcal: g.kcal,
        })),
    }));
  }

  async nextOwnCode(organizationId: string): Promise<string> {
    const [row] = await this.db.tx.$queryRaw<{ value: bigint }[]>`
      INSERT INTO platform.counter AS c (organization_id, name, next_value)
      VALUES (${organizationId}::uuid, 'food', 2)
      ON CONFLICT (organization_id, name) DO UPDATE SET next_value = c.next_value + 1
      RETURNING c.next_value - 1 AS value`;
    return String(row?.value ?? 1);
  }

  async insertOwn(food: NewOwnFood): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO food.food (id, organization_id, source_code, source_food_code, name_es, state, edible_portion_pct,
                             created_by)
      VALUES (${food.id}::uuid, ${food.organizationId}::uuid, 'ORG', ${food.code}, ${food.name}, ${food.state},
              ${food.ediblePortionPct}, ${food.createdBy}::uuid)`;
    await this.#nutrients(food.id, food.organizationId, food);
    await this.#measures(food.id, food.organizationId, food);
  }

  async updateOwn(id: string, version: number, food: OwnFood): Promise<boolean> {
    const updated = await this.db.tx.$queryRaw<{ organization_id: string }[]>`
      UPDATE food.food
      SET name_es = ${food.name}, state = ${food.state}, edible_portion_pct = ${food.ediblePortionPct},
          version = version + 1, updated_at = now()
      WHERE id = ${id}::uuid AND version = ${version} AND organization_id IS NOT NULL
      RETURNING organization_id`;
    const [row] = updated;
    if (!row) return false;
    await this.#nutrients(id, row.organization_id, food);
    await this.db.tx.$executeRaw`DELETE FROM food.household_measure WHERE food_id = ${id}::uuid`;
    await this.#measures(id, row.organization_id, food);
    return true;
  }

  async #nutrients(foodId: string, organizationId: string, food: OwnFood): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO food.food_nutrient AS fn (food_id, nutrient_code, organization_id, value_per_100g, value_flag)
      SELECT ${foodId}::uuid, n.code, ${organizationId}::uuid, n.value, n.flag
      FROM unnest(${food.nutrients.map((n) => n.nutrientCode)}::text[],
                  ${food.nutrients.map((n) => n.valuePer100g)}::numeric[],
                  ${food.nutrients.map((n) => n.flag)}::text[]) AS n(code, value, flag)
      ON CONFLICT (food_id, nutrient_code) DO UPDATE
        SET value_per_100g = excluded.value_per_100g, value_flag = excluded.value_flag`;
  }

  async #measures(foodId: string, organizationId: string, food: OwnFood): Promise<void> {
    if (food.measures.length === 0) return;
    await this.db.tx.$executeRaw`
      INSERT INTO food.household_measure (id, food_id, organization_id, name_es, grams)
      SELECT n.id, ${foodId}::uuid, ${organizationId}::uuid, n.name, n.grams
      FROM unnest(${food.measures.map(() => this.ids.newId())}::uuid[], ${food.measures.map((m) => m.name)}::text[],
                  ${food.measures.map((m) => m.grams)}::numeric[]) AS n(id, name, grams)`;
  }
}
