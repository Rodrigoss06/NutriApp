import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  NewRecipe,
  RecipeRecord,
  RecipeSearch,
  RecipeStore,
  RecipeSummaryRecord,
} from '../../../application/ports/recipe.port.js';
import type { RecipeNutrients } from '../../../application/recipe-nutrients.js';
import type { Recipe, RecipeStatus } from '../../../domain/recipe.js';

interface RecipeRow {
  id: string;
  organization_id: string;
  name_es: string;
  servings: number;
  cooked_weight_g: number | null;
  instructions: string | null;
  tags: string[];
  status: RecipeStatus;
  version: number;
  nutrients_per_serving: Partial<RecipeNutrients>;
}

/**
 * food.recipe y food.recipe_ingredient con la transacción de la UnitOfWork. La RLS deja ver y escribir solo las recetas
 * de la organización activa (RN-A01).
 */
@Injectable()
export class PrismaRecipeStore implements RecipeStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  /** Como la búsqueda de alimentos: sin tildes ni mayúsculas, todas las palabras o parecido por pg_trgm. */
  async search({ text, status, limit }: RecipeSearch): Promise<readonly RecipeSummaryRecord[]> {
    const rows = await this.db.tx.$queryRaw<
      {
        id: string;
        name_es: string;
        servings: number;
        status: RecipeStatus;
        tags: string[];
        ingredient_count: number;
        kcal: number | null;
        score: number;
      }[]
    >`
      WITH q AS (SELECT app.unaccent_immutable(lower(${text}::text)) AS t)
      SELECT r.id, r.name_es, r.servings::float8 AS servings, r.status, r.tags,
             (SELECT count(*) FROM food.recipe_ingredient i WHERE i.recipe_id = r.id)::int AS ingredient_count,
             (r.nutrients_per_serving #>> '{perServing,ENERC_KCAL,value}')::float8 AS kcal,
             coalesce(word_similarity(q.t, r.search_text), 0)::float8 AS score
      FROM food.recipe r
      CROSS JOIN q
      WHERE r.status = ${status}
        AND (q.t IS NULL
             OR NOT EXISTS (SELECT 1 FROM unnest(string_to_array(q.t, ' ')) AS word
                            WHERE word <> '' AND r.search_text NOT LIKE '%' || word || '%')
             OR q.t <% r.search_text)
      ORDER BY coalesce(r.search_text LIKE q.t || '%', false) DESC,
               coalesce(r.search_text LIKE '%' || q.t || '%', false) DESC,
               score DESC, length(r.name_es), r.name_es
      LIMIT ${limit}`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name_es,
      servings: row.servings,
      status: row.status,
      tags: row.tags,
      ingredientCount: row.ingredient_count,
      energyKcalPerServing: row.kcal,
      score: row.score,
    }));
  }

  async byIds(ids: readonly string[]): Promise<readonly RecipeRecord[]> {
    if (ids.length === 0) return [];
    const recipes = await this.db.tx.$queryRaw<RecipeRow[]>`
      SELECT id, organization_id, name_es, servings::float8 AS servings, cooked_weight_g::float8 AS cooked_weight_g,
             instructions, tags, status, version, nutrients_per_serving
      FROM food.recipe WHERE id = ANY(${[...ids]}::uuid[])`;
    if (recipes.length === 0) return [];
    const ingredients = await this.db.tx.$queryRaw<
      {
        recipe_id: string;
        position: number;
        food_id: string;
        grams: number;
        household_text: string | null;
      }[]
    >`
      SELECT recipe_id, position, food_id, grams::float8 AS grams, household_text
      FROM food.recipe_ingredient WHERE recipe_id = ANY(${recipes.map((r) => r.id)}::uuid[])
      ORDER BY recipe_id, position`;
    return recipes.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name_es,
      servings: row.servings,
      cookedWeightG: row.cooked_weight_g,
      instructions: row.instructions,
      tags: row.tags,
      status: row.status,
      version: row.version,
      ingredients: ingredients
        .filter((i) => i.recipe_id === row.id)
        .map((i) => ({
          position: i.position,
          foodId: i.food_id,
          grams: i.grams,
          householdText: i.household_text,
        })),
      // La columna nace como '{}': sin método, nunca se calculó.
      nutrients: row.nutrients_per_serving.methodCode
        ? (row.nutrients_per_serving as RecipeNutrients)
        : null,
    }));
  }

  async insert(recipe: NewRecipe): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO food.recipe (id, organization_id, name_es, servings, cooked_weight_g, instructions, tags,
                               nutrients_per_serving, created_by)
      VALUES (${recipe.id}::uuid, ${recipe.organizationId}::uuid, ${recipe.name}, ${recipe.servings},
              ${recipe.cookedWeightG}, ${recipe.instructions}, ${[...recipe.tags]}::text[],
              ${JSON.stringify(recipe.nutrients)}::jsonb, ${recipe.createdBy}::uuid)`;
    await this.#ingredients(recipe.id, recipe.organizationId, recipe);
  }

  async update(
    id: string,
    version: number,
    recipe: Recipe,
    nutrients: RecipeNutrients,
  ): Promise<boolean> {
    const [row] = await this.db.tx.$queryRaw<{ organization_id: string }[]>`
      UPDATE food.recipe
      SET name_es = ${recipe.name}, servings = ${recipe.servings}, cooked_weight_g = ${recipe.cookedWeightG},
          instructions = ${recipe.instructions}, tags = ${[...recipe.tags]}::text[],
          nutrients_per_serving = ${JSON.stringify(nutrients)}::jsonb, version = version + 1, updated_at = now()
      WHERE id = ${id}::uuid AND version = ${version}
      RETURNING organization_id`;
    if (!row) return false;
    await this.db.tx.$executeRaw`DELETE FROM food.recipe_ingredient WHERE recipe_id = ${id}::uuid`;
    await this.#ingredients(id, row.organization_id, recipe);
    return true;
  }

  async setStatus(id: string, version: number, status: RecipeStatus): Promise<boolean> {
    const updated = await this.db.tx.$executeRaw`
      UPDATE food.recipe SET status = ${status}, version = version + 1, updated_at = now()
      WHERE id = ${id}::uuid AND version = ${version}`;
    return updated === 1;
  }

  async usingFood(foodId: string): Promise<readonly RecipeRecord[]> {
    const rows = await this.db.tx.$queryRaw<{ recipe_id: string }[]>`
      SELECT DISTINCT recipe_id FROM food.recipe_ingredient WHERE food_id = ${foodId}::uuid`;
    return this.byIds(rows.map((r) => r.recipe_id));
  }

  async saveNutrients(id: string, nutrients: RecipeNutrients): Promise<void> {
    await this.db.tx.$executeRaw`
      UPDATE food.recipe SET nutrients_per_serving = ${JSON.stringify(nutrients)}::jsonb WHERE id = ${id}::uuid`;
  }

  async #ingredients(recipeId: string, organizationId: string, recipe: Recipe): Promise<void> {
    const list = recipe.ingredients;
    await this.db.tx.$executeRaw`
      INSERT INTO food.recipe_ingredient (recipe_id, position, organization_id, food_id, grams, household_text)
      SELECT ${recipeId}::uuid, i.position, ${organizationId}::uuid, i.food_id, i.grams, i.household_text
      FROM unnest(${list.map((i) => i.position)}::smallint[], ${list.map((i) => i.foodId)}::uuid[],
                  ${list.map((i) => i.grams)}::numeric[], ${list.map((i) => i.householdText)}::text[])
        AS i(position, food_id, grams, household_text)`;
  }
}
