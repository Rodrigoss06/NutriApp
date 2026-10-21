import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ID_GENERATOR, type IdGenerator } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type { FoodCatalogStore } from '../../../application/ports/food-catalog.port.js';
import type { CatalogFood } from '../../../domain/catalog-food.js';
import type { CatalogCookingFactor, CatalogMeasure } from '../../../domain/catalog-measure.js';

/**
 * Los catálogos globales de food con la transacción de la UnitOfWork. Una sentencia con unnest por tabla para todo el
 * lote; una fila sin cambios no se toca, así updated_at dice cuándo cambió de verdad.
 */
@Injectable()
export class PrismaFoodCatalogStore implements FoodCatalogStore {
  constructor(
    @Inject(TransactionHost) private readonly db: Db,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async upsertSourceFoods(sourceCode: string, foods: readonly CatalogFood[]): Promise<void> {
    if (foods.length === 0) return;
    await this.db.tx.$executeRaw`
      INSERT INTO food.food AS f (id, organization_id, source_code, source_food_code, name_es, group_code, state, tags)
      SELECT n.id, NULL, ${sourceCode}, n.code, n.name, n.group_code, n.state,
             ARRAY(SELECT jsonb_array_elements_text(n.tags))
      FROM unnest(${foods.map(() => this.ids.newId())}::uuid[], ${foods.map((f) => f.code)}::text[],
                  ${foods.map((f) => f.name)}::text[], ${foods.map((f) => f.groupCode)}::text[],
                  ${foods.map((f) => f.state)}::text[], ${foods.map((f) => JSON.stringify(f.tags))}::jsonb[])
        AS n(id, code, name, group_code, state, tags)
      ON CONFLICT (organization_id, source_code, source_food_code) DO UPDATE
        SET name_es = excluded.name_es, group_code = excluded.group_code, state = excluded.state,
            tags = excluded.tags, status = 'ACTIVE', updated_at = now()
        WHERE (f.name_es, f.group_code, f.state, f.tags, f.status)
              IS DISTINCT FROM (excluded.name_es, excluded.group_code, excluded.state, excluded.tags, 'ACTIVE')`;

    const values = foods.flatMap((food) => food.nutrients.map((nutrient) => ({ food, nutrient })));
    await this.db.tx.$executeRaw`
      INSERT INTO food.food_nutrient AS fn (food_id, nutrient_code, organization_id, value_per_100g, value_flag)
      SELECT f.id, n.nutrient_code, NULL, n.value, n.flag
      FROM unnest(${values.map((v) => v.food.code)}::text[], ${values.map((v) => v.nutrient.nutrientCode)}::text[],
                  ${values.map((v) => v.nutrient.valuePer100g)}::numeric[], ${values.map((v) => v.nutrient.flag)}::text[])
        AS n(food_code, nutrient_code, value, flag)
      JOIN food.food f
        ON f.organization_id IS NULL AND f.source_code = ${sourceCode} AND f.source_food_code = n.food_code
      ON CONFLICT (food_id, nutrient_code) DO UPDATE
        SET value_per_100g = excluded.value_per_100g, value_flag = excluded.value_flag
        WHERE (fn.value_per_100g, fn.value_flag) IS DISTINCT FROM (excluded.value_per_100g, excluded.value_flag)`;

    await this.#imported(sourceCode);
  }

  async upsertSourceMeasures(
    sourceCode: string,
    foodSourceCode: string,
    measures: readonly CatalogMeasure[],
  ): Promise<void> {
    if (measures.length === 0) return;
    await this.#requireFoods(
      foodSourceCode,
      measures.map((m) => m.foodCode),
    );
    await this.db.tx.$executeRaw`
      INSERT INTO food.household_measure AS m
        (id, food_id, organization_id, name_es, grams, gross_grams, source_code, source_measure_code)
      SELECT n.id, f.id, NULL, n.name, n.grams, n.gross, ${sourceCode}, n.code
      FROM unnest(${measures.map(() => this.ids.newId())}::uuid[], ${measures.map((m) => m.code)}::text[],
                  ${measures.map((m) => m.foodCode)}::text[], ${measures.map((m) => m.name)}::text[],
                  ${measures.map((m) => m.grams)}::numeric[], ${measures.map((m) => m.grossGrams)}::numeric[])
        AS n(id, code, food_code, name, grams, gross)
      JOIN food.food f
        ON f.organization_id IS NULL AND f.source_code = ${foodSourceCode} AND f.source_food_code = n.food_code
      ON CONFLICT (organization_id, source_code, source_measure_code) WHERE source_measure_code IS NOT NULL
      DO UPDATE SET food_id = excluded.food_id, name_es = excluded.name_es, grams = excluded.grams,
                    gross_grams = excluded.gross_grams
        WHERE (m.food_id, m.name_es, m.grams, m.gross_grams)
              IS DISTINCT FROM (excluded.food_id, excluded.name_es, excluded.grams, excluded.gross_grams)`;
    await this.#imported(sourceCode);
  }

  async upsertCookingFactors(
    sourceCode: string,
    foodSourceCode: string,
    factors: readonly CatalogCookingFactor[],
  ): Promise<void> {
    if (factors.length === 0) return;
    await this.#requireFoods(
      foodSourceCode,
      factors.map((f) => f.foodCode),
    );
    await this.db.tx.$executeRaw`
      INSERT INTO food.cooking_factor AS c
        (id, organization_id, food_id, source_code, source_item_code, name_es, cooking_method_es, cooked_to_raw_factor)
      SELECT n.id, NULL, f.id, ${sourceCode}, n.code, n.name, n.method, n.factor
      FROM unnest(${factors.map(() => this.ids.newId())}::uuid[], ${factors.map((f) => f.code)}::text[],
                  ${factors.map((f) => f.foodCode)}::text[], ${factors.map((f) => f.name)}::text[],
                  ${factors.map((f) => f.method)}::text[], ${factors.map((f) => f.cookedToRawFactor)}::numeric[])
        AS n(id, code, food_code, name, method, factor)
      JOIN food.food f
        ON f.organization_id IS NULL AND f.source_code = ${foodSourceCode} AND f.source_food_code = n.food_code
      ON CONFLICT (organization_id, source_code, source_item_code) WHERE source_item_code IS NOT NULL
      DO UPDATE SET food_id = excluded.food_id, name_es = excluded.name_es,
                    cooking_method_es = excluded.cooking_method_es,
                    cooked_to_raw_factor = excluded.cooked_to_raw_factor, updated_at = now()
        WHERE (c.food_id, c.name_es, c.cooking_method_es, c.cooked_to_raw_factor)
              IS DISTINCT FROM (excluded.food_id, excluded.name_es, excluded.cooking_method_es,
                                excluded.cooked_to_raw_factor)`;
    await this.#imported(sourceCode);
  }

  /** Una medida o un factor de un alimento que no está cargado haría fallar el lote entero, con los códigos. */
  async #requireFoods(foodSourceCode: string, codes: readonly string[]): Promise<void> {
    const missing = await this.db.tx.$queryRaw<{ code: string }[]>`
      SELECT DISTINCT n.code FROM unnest(${[...codes]}::text[]) AS n(code)
      WHERE NOT EXISTS (SELECT 1 FROM food.food f
                        WHERE f.organization_id IS NULL AND f.source_code = ${foodSourceCode}
                          AND f.source_food_code = n.code)
      ORDER BY n.code`;
    if (missing.length > 0) {
      const list = missing.map((m) => m.code).join(', ');
      throw new Error(
        `Faltan alimentos de ${foodSourceCode}: ${list}. Cárguelos antes (pnpm catalog:load).`,
      );
    }
  }

  async #imported(sourceCode: string): Promise<void> {
    await this.db.tx
      .$executeRaw`UPDATE food.source SET imported_at = now() WHERE code = ${sourceCode}`;
  }
}
