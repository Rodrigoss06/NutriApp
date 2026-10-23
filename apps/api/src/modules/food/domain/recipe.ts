import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

export const RECIPE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
/** Una receta no se borra: se archiva y deja de ofrecerse al prescribir. */
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

/** Un ingrediente como lo manda quien edita la receta. */
export interface RecipeIngredientInput {
  readonly foodId: string;
  /** Gramos de parte comestible en el estado del alimento (RN-E12). */
  readonly grams: number;
  /** La medida casera con que se ingresó («1 taza»); solo se muestra. */
  readonly householdText: string | null;
}

/** Lo que manda quien crea o edita una receta, ya validado en su forma por el contrato. */
export interface RecipeInput {
  readonly name: string;
  readonly servings: number;
  /** Peso de la preparación cocida, para el factor de rendimiento (RN-E12). */
  readonly cookedWeightG: number | null;
  readonly instructions: string | null;
  readonly tags: readonly string[];
  readonly ingredients: readonly RecipeIngredientInput[];
}

export interface RecipeIngredient extends RecipeIngredientInput {
  /** 1, 2, 3… en el orden en que se ingresaron. */
  readonly position: number;
}

/** Una receta lista para guardar y calcular. */
export interface Recipe extends Omit<RecipeInput, 'ingredients'> {
  readonly ingredients: readonly RecipeIngredient[];
}

export const INVALID_RECIPE = 'NC-FOOD-007';

const tagKey = (tag: string): string => tag.trim().toLowerCase();

/** Dos decimales, los que guarda la base (numeric(8,2) y numeric(6,2)): se calcula con lo mismo que se guarda. */
const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Una receta de la organización (RF-21, RN-E12): ingredientes en gramos de parte comestible, porciones que rinde y,
 * si se pesó, el peso cocido. Los nutrientes por porción los calcula el motor (RECIPE_NUTRIENTS); aquí solo se
 * cuida que haya algo que calcular. Las cantidades quedan con los dos decimales que guarda la base y las etiquetas, sin
 * espacios de más y sin repetirse.
 */
export function recipe(input: RecipeInput): Result<Recipe, DomainError> {
  const servings = cents(input.servings);
  const cookedWeightG = input.cookedWeightG === null ? null : cents(input.cookedWeightG);
  const ingredients = input.ingredients.map(({ foodId, grams, householdText }, index) => ({
    position: index + 1,
    foodId,
    grams: cents(grams),
    householdText,
  }));
  const problems: string[] = [];
  if (!(servings > 0)) problems.push('La receta rinde más de cero porciones.');
  if (cookedWeightG !== null && !(cookedWeightG > 0)) {
    problems.push('El peso cocido es mayor que cero.');
  }
  if (ingredients.length === 0) problems.push('Agrega al menos un ingrediente.');
  ingredients.forEach(({ grams, position }) => {
    if (!(grams > 0)) problems.push(`El ingrediente ${String(position)} pesa más de cero gramos.`);
  });
  if (problems.length > 0) {
    return err(
      domainError({
        code: INVALID_RECIPE,
        rule: 'RN-E12',
        message: 'Revisa los ingredientes y las porciones de la receta.',
        details: { problems },
      }),
    );
  }

  const tags = new Map<string, string>();
  for (const tag of input.tags) {
    if (tag.trim() !== '' && !tags.has(tagKey(tag))) tags.set(tagKey(tag), tag.trim());
  }
  return ok({
    name: input.name,
    servings,
    cookedWeightG,
    instructions: input.instructions,
    tags: [...tags.values()],
    ingredients,
  });
}

/** Los campos que cambian, para la auditoría: nombres, nunca valores (02 §10). */
export function recipeChangedFields(before: Recipe, after: Recipe): string[] {
  const fields: string[] = [];
  if (before.name !== after.name) fields.push('name_es');
  if (before.servings !== after.servings) fields.push('servings');
  if (before.cookedWeightG !== after.cookedWeightG) fields.push('cooked_weight_g');
  if (before.instructions !== after.instructions) fields.push('instructions');
  if (before.tags.join('\n') !== after.tags.join('\n')) fields.push('tags');
  const ingredients = (recipe: Recipe) =>
    JSON.stringify(recipe.ingredients.map((i) => [i.foodId, i.grams, i.householdText]));
  if (ingredients(before) !== ingredients(after)) fields.push('ingredients');
  return fields;
}
