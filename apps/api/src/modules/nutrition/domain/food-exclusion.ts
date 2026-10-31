import { domainError, type DomainError } from '@nutricoach/shared-kernel';
import { DAYS_OF_WEEK, type MenuItem, type PlanDraft } from './food-plan.js';

export type DietaryConditionKind = 'ALLERGY' | 'INTOLERANCE';

/** Una alergia o intolerancia activa del paciente con los alimentos que excluye de su dieta (07 §12). */
export interface FoodExclusion {
  readonly conditionId: string;
  readonly kind: DietaryConditionKind;
  readonly label: string;
  readonly foodIds: readonly string[];
}

/** Una receta con los alimentos que lleva. */
export interface RecipeContents {
  readonly name: string;
  readonly foodIds: readonly string[];
}

/** Un alimento en un plan y dónde está: suelto o, si recipeName no es null, dentro de esa receta. */
export interface PlanFoodUse {
  readonly foodId: string;
  readonly where: string;
  readonly recipeName: string | null;
}

/** El plan lleva un alimento excluido: en details.problems, cuál, dónde y por qué (RN-E17). */
export const PLAN_HAS_EXCLUDED_FOODS = 'NC-NUT-015';
export const planHasExcludedFoods = (problems: readonly string[]): DomainError =>
  domainError({
    code: PLAN_HAS_EXCLUDED_FOODS,
    rule: 'RN-E17',
    message: 'El plan lleva alimentos excluidos por una alergia o intolerancia.',
    details: { problems },
  });
export const CONDITION_NOT_DIETARY = domainError({
  code: 'NC-NUT-016',
  rule: 'RN-E17',
  message: 'Solo una alergia o intolerancia activa excluye alimentos.',
});
export const EXCLUDED_FOOD_NOT_FOUND = domainError({
  code: 'NC-NUT-017',
  rule: 'RN-I01',
  message: 'Un alimento no existe o no es de tu organización.',
});

const KIND_TEXT: Readonly<Record<DietaryConditionKind, string>> = {
  ALLERGY: 'una alergia',
  INTOLERANCE: 'una intolerancia',
};

const MAX_PLACES = 3;

/** «Almuerzo, Cena»; con muchos, los primeros y cuántos más. */
function places(uses: readonly PlanFoodUse[]): string {
  const unique = [...new Set(uses.map((use) => use.where))];
  const shown = unique.slice(0, MAX_PLACES).join(', ');
  const rest = unique.length - MAX_PLACES;
  return rest > 0 ? `${shown} y ${String(rest)} más` : shown;
}

/** Las recetas de un plan: solo el menú semanal las usa. */
export function planRecipeIds(draft: PlanDraft): readonly string[] {
  if (draft.modality !== 'WEEKLY_MENU') return [];
  return [
    ...new Set(
      draft.days.flatMap((day) =>
        day.meals.flatMap((cell) =>
          [...cell.optionA, ...cell.optionB].flatMap((item) =>
            item.itemType === 'RECIPE' ? [item.recipeId] : [],
          ),
        ),
      ),
    ),
  ];
}

const dayName = (index: number): string => {
  const day = DAYS_OF_WEEK[index] ?? '';
  return day.charAt(0).toUpperCase() + day.slice(1);
};

function menuItemUses(
  item: MenuItem,
  where: string,
  recipes: ReadonlyMap<string, RecipeContents>,
): readonly PlanFoodUse[] {
  if (item.itemType === 'FOOD') return [{ foodId: item.foodId, where, recipeName: null }];
  const recipe = recipes.get(item.recipeId);
  if (!recipe) throw new Error(`Receta ${item.recipeId} sin cargar.`);
  return recipe.foodIds.map((foodId) => ({ foodId, where, recipeName: recipe.name }));
}

/** Cada alimento del plan con su lugar, de cualquier modalidad; una receta entra como sus ingredientes. */
export function planFoodUses(
  draft: PlanDraft,
  recipes: ReadonlyMap<string, RecipeContents>,
): readonly PlanFoodUse[] {
  switch (draft.modality) {
    case 'EXCHANGES':
      return draft.meals.flatMap((meal) =>
        meal.allowedFoods.map(({ foodId }) => ({ foodId, where: meal.name, recipeName: null })),
      );
    case 'COMPOSITION':
      return draft.meals.flatMap((meal) =>
        meal.items.map(({ foodId }) => ({ foodId, where: meal.name, recipeName: null })),
      );
    case 'WEEKLY_MENU':
      return draft.days.flatMap((day, d) =>
        day.meals.flatMap((cell, m) =>
          [...cell.optionA, ...cell.optionB].flatMap((item) =>
            menuItemUses(item, `${dayName(d)} · ${draft.meals[m]?.name ?? ''}`, recipes),
          ),
        ),
      );
  }
}

/**
 * RN-E17: un plan no lleva un alimento enlazado a una alergia o intolerancia activa, ni una receta que lo tenga de
 * ingrediente. Cada problema dice cuál, dónde y por qué. El enlace lo hace quien atiende: el nombre de la condición nunca
 * se compara con el de los alimentos.
 */
export function excludedFoodProblems(
  uses: readonly PlanFoodUse[],
  exclusions: readonly FoodExclusion[],
  foodNames: ReadonlyMap<string, string>,
): readonly string[] {
  return exclusions.flatMap((exclusion) =>
    exclusion.foodIds.flatMap((foodId) => {
      const matching = uses.filter((use) => use.foodId === foodId);
      const name = foodNames.get(foodId) ?? 'Un alimento';
      const reason = `excluido por ${KIND_TEXT[exclusion.kind]}, «${exclusion.label}» (RN-E17).`;
      const loose = matching.filter((use) => use.recipeName === null);
      const recipeNames = [...new Set(matching.flatMap((use) => use.recipeName ?? []))];
      return [
        ...(loose.length > 0 ? [`${name} (${places(loose)}): ${reason}`] : []),
        ...recipeNames.map((recipeName) => {
          const inRecipe = matching.filter((use) => use.recipeName === recipeName);
          return `Receta «${recipeName}» (${places(inRecipe)}): lleva ${name}, ${reason}`;
        }),
      ];
    }),
  );
}
