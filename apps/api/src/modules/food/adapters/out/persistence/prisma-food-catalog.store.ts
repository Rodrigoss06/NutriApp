import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ID_GENERATOR, type IdGenerator } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type { FoodCatalogStore } from '../../../application/ports/food-catalog.port.js';
import type { CatalogFood } from '../../../domain/catalog-food.js';

/**
 * food.food y food.food_nutrient con la transacción de la UnitOfWork. Dos sentencias con unnest para todo el lote; un
 * alimento o un valor sin cambios no se toca, así updated_at dice cuándo cambió de verdad.
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

    await this.db.tx
      .$executeRaw`UPDATE food.source SET imported_at = now() WHERE code = ${sourceCode}`;
  }
}
