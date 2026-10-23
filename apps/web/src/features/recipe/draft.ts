import type { FoodState, RecipeDetail, RecipeRequest } from '@nutricoach/contracts';
import { parseDecimal } from '@nutricoach/ui';

/** La unidad de un ingrediente: gramos, o el id de una medida casera de su alimento. */
export const GRAMS = 'GRAMS';
export const MAX_INGREDIENTS = 50;

export interface MeasureOption {
  readonly id: string;
  readonly name: string;
  /** Gramos de parte comestible (RN-E12). */
  readonly grams: number;
}

export interface IngredientRow {
  readonly key: string;
  readonly foodId: string;
  readonly foodName: string;
  /** Dice si los gramos son crudos o cocidos (RN-E12). */
  readonly foodState: FoodState;
  readonly measures: readonly MeasureOption[];
  readonly unit: string;
  readonly amount: string;
  /** La medida con que se guardó, mientras no se cambie la cantidad. */
  readonly savedHouseholdText: string | null;
}

/** La receta como se escribe: textos, para que la persona pueda dejar un campo a medias. */
export interface RecipeDraft {
  readonly name: string;
  readonly servings: string;
  readonly cookedWeightG: string;
  /** Separadas por comas. */
  readonly tags: string;
  readonly instructions: string;
  readonly ingredients: readonly IngredientRow[];
}

export interface DraftErrors {
  readonly name?: string;
  readonly servings?: string;
  readonly cookedWeightG?: string;
  /** Por key del ingrediente. */
  readonly ingredients?: Readonly<Record<string, string>>;
  readonly list?: string;
}

/** La receta guardada, lista para editarse; measures trae las medidas caseras de cada alimento. */
export function draftOf(
  recipe?: Pick<
    RecipeDetail,
    'name' | 'servings' | 'cookedWeightG' | 'instructions' | 'tags' | 'ingredients'
  >,
  measures: Readonly<Record<string, readonly MeasureOption[]>> = {},
): RecipeDraft {
  return {
    name: recipe?.name ?? '',
    servings: recipe ? String(recipe.servings) : '1',
    cookedWeightG: recipe?.cookedWeightG === null || !recipe ? '' : String(recipe.cookedWeightG),
    tags: recipe?.tags.join(', ') ?? '',
    instructions: recipe?.instructions ?? '',
    ingredients:
      recipe?.ingredients.map((ingredient) => ({
        key: `${String(ingredient.position)}-${ingredient.foodId}`,
        foodId: ingredient.foodId,
        foodName: ingredient.name,
        foodState: ingredient.state,
        measures: measures[ingredient.foodId] ?? [],
        unit: GRAMS,
        amount: String(ingredient.grams),
        savedHouseholdText: ingredient.householdText,
      })) ?? [],
  };
}

/** Gramos y medida casera de un ingrediente, o null si la cantidad no sirve. */
export function ingredientOf(
  row: IngredientRow,
): { grams: number; householdText: string | null } | null {
  const amount = parseDecimal(row.amount);
  if (row.unit === GRAMS) {
    return amount !== null && amount > 0 && amount <= 99_999
      ? { grams: amount, householdText: row.savedHouseholdText }
      : null;
  }
  const measure = row.measures.find((m) => m.id === row.unit);
  if (!measure || amount === null || !(amount > 0) || amount > 100) return null;
  return { grams: measure.grams * amount, householdText: `${String(amount)} × ${measure.name}` };
}

/** Lo que falta para poder calcular la receta; vacío si se puede enviar. */
export function draftErrors(draft: RecipeDraft): DraftErrors {
  const servings = parseDecimal(draft.servings);
  const cooked = parseDecimal(draft.cookedWeightG);
  const ingredients = Object.fromEntries(
    draft.ingredients
      .filter((row) => ingredientOf(row) === null)
      .map((row) => [row.key, row.unit === GRAMS ? 'Más de 0 g.' : 'Más de 0 y hasta 100.']),
  );
  return {
    ...(draft.name.trim().length >= 2 ? {} : { name: 'Escribe el nombre: 2 letras o más.' }),
    ...(servings !== null && servings > 0 && servings <= 1_000
      ? {}
      : { servings: 'Más de 0 y hasta 1,000 porciones.' }),
    ...(draft.cookedWeightG.trim() === '' || (cooked !== null && cooked > 0 && cooked <= 99_999)
      ? {}
      : { cookedWeightG: 'Déjalo vacío o escribe los gramos: más de 0.' }),
    ...(Object.keys(ingredients).length > 0 ? { ingredients } : {}),
    ...(draft.ingredients.length === 0 ? { list: 'Agrega al menos un ingrediente.' } : {}),
  };
}

/** El pedido para la API, o null mientras falte algo (RN-E12). */
export function requestOf(draft: RecipeDraft): RecipeRequest | null {
  if (Object.keys(draftErrors(draft)).length > 0) return null;
  const ingredients = draft.ingredients.map((row) => ({ row, amount: ingredientOf(row) }));
  return {
    name: draft.name.trim(),
    servings: parseDecimal(draft.servings) ?? 0,
    cookedWeightG: draft.cookedWeightG.trim() === '' ? null : parseDecimal(draft.cookedWeightG),
    instructions: draft.instructions.trim() === '' ? null : draft.instructions.trim(),
    tags: draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ''),
    ingredients: ingredients.map(({ row, amount }) => ({
      foodId: row.foodId,
      grams: amount?.grams ?? 0,
      householdText: amount?.householdText ?? null,
    })),
  };
}
