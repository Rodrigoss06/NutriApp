import type {
  CompositionNutritionPlan,
  DayProfileInput,
  FoodDetail,
  FoodState,
  MealSlot,
  MenuItemView,
  RecipeSummary,
  UpdateCompositionPlan,
  UpdateWeeklyMenuPlan,
  WeeklyMenuNutritionPlan,
} from '@nutricoach/contracts';
import { parseDecimal } from '@nutricoach/ui';
import { hydrationOf, isTimeOfDay, MAX_MEALS, sharePctOf } from '@/features/nutrition-plan/draft';
import {
  dayProfileRowsOf,
  dayProfilesBody,
  type DayProfileRow,
} from '@/features/nutrition-plan/day-profiles';
import { GRAMS, type MeasureOption } from '@/features/recipe/draft';

export { MAX_MEALS };

/** Como el contrato: hasta 40 alimentos por tiempo en composición y 20 por opción en el menú. */
export const MAX_COMPOSITION_ITEMS = 40;
export const MAX_OPTION_ITEMS = 20;

export const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

/**
 * La cantidad de un alimento en un perfil de día como se escribe (07 §2, P-20.5): en gramos, con la medida casera con que se
 * guardó mientras no se cambie; «0», ese día no va.
 */
export interface ProfileFoodAmount {
  readonly grams: string;
  readonly householdText: string | null;
}

/** Las porciones de una receta en un perfil de día como se escriben (P-20.5); «0», ese día no va. */
export interface ProfileRecipeAmount {
  readonly servings: string;
}

/** Un alimento como se escribe: en gramos de parte comestible o en una de sus medidas caseras (RN-E12). */
export interface FoodItemRow {
  readonly kind: 'FOOD';
  readonly key: string;
  readonly foodId: string;
  readonly foodName: string;
  /** Dice si los gramos son crudos o cocidos (RN-E12). */
  readonly foodState: FoodState;
  readonly measures: readonly MeasureOption[];
  /** GRAMS o el id de una medida casera. */
  readonly unit: string;
  readonly amount: string;
  /** La medida con que se guardó, mientras no se cambie la cantidad. */
  readonly savedHouseholdText: string | null;
  /** Su cantidad en los perfiles de día que la cambian, por código (P-20.5); sin la clave, la del plan. */
  readonly byProfile: Readonly<Record<string, ProfileFoodAmount>>;
}

/** Una receta del recetario, en porciones (RN-E16). */
export interface RecipeItemRow {
  readonly kind: 'RECIPE';
  readonly key: string;
  readonly recipeId: string;
  readonly recipeName: string;
  readonly servings: string;
  /** Sus porciones en los perfiles de día que las cambian, por código (P-20.5); sin la clave, las del plan. */
  readonly byProfile: Readonly<Record<string, ProfileRecipeAmount>>;
}

export type ItemRow = FoodItemRow | RecipeItemRow;

export interface MealHeaderRow {
  readonly key: string;
  readonly slotCode: MealSlot;
  readonly name: string;
  /** HH:MM o vacío. */
  readonly timeOfDay: string;
  readonly sharePct: string;
}

export interface CompositionMealRow extends MealHeaderRow {
  readonly items: readonly FoodItemRow[];
}

/** Una dieta por composición como se escribe: textos, para que la persona pueda dejar un campo a medias. */
export interface CompositionDraft {
  readonly meals: readonly CompositionMealRow[];
  readonly hydrationMl: string;
  readonly instructions: string;
  /** Los perfiles de día además de Entrenamiento (07 §2, P-20); vacío, una sola meta. */
  readonly dayProfiles: readonly DayProfileRow[];
}

export type MenuOption = 'optionA' | 'optionB';

export type MenuCellRow = Readonly<Record<MenuOption, readonly ItemRow[]>>;

/** Un menú semanal como se escribe: de lunes a domingo, una celda por tiempo de comida y en su orden. */
export interface MenuDraft {
  readonly meals: readonly MealHeaderRow[];
  readonly days: readonly { readonly cells: readonly MenuCellRow[] }[];
  readonly hydrationMl: string;
  readonly instructions: string;
  /** Los perfiles de día además de Entrenamiento (07 §2, P-20); vacío, una sola meta. */
  readonly dayProfiles: readonly DayProfileRow[];
}

/** Las medidas caseras de cada alimento del plan, por su id. */
export type Measures = Readonly<Record<string, readonly MeasureOption[]>>;

type FoodItemView = Extract<MenuItemView, { itemType: 'FOOD' }>;

const headerOf = (
  meal: {
    readonly slotCode: MealSlot;
    readonly name: string;
    readonly timeOfDay: string | null;
    readonly sharePct: number;
  },
  key: string,
): MealHeaderRow => ({
  key,
  slotCode: meal.slotCode,
  name: meal.name,
  timeOfDay: meal.timeOfDay ?? '',
  sharePct: String(meal.sharePct),
});

/** Un alimento guardado: vuelve en gramos con la medida con que se guardó. */
function savedFoodRow(item: FoodItemView, key: string, measures: Measures): FoodItemRow {
  return {
    kind: 'FOOD',
    key,
    foodId: item.foodId,
    foodName: item.foodName,
    foodState: item.state,
    measures: measures[item.foodId] ?? [],
    unit: GRAMS,
    amount: String(item.grams),
    savedHouseholdText: item.householdText,
    byProfile: Object.fromEntries(
      Object.entries(item.byProfile).map(([code, portion]) => [
        code,
        { grams: String(portion.grams), householdText: portion.householdText },
      ]),
    ),
  };
}

function savedItemRow(item: MenuItemView, key: string, measures: Measures): ItemRow {
  return item.itemType === 'FOOD'
    ? savedFoodRow(item, key, measures)
    : {
        kind: 'RECIPE',
        key,
        recipeId: item.recipeId,
        recipeName: item.recipeName,
        servings: String(item.servings),
        byProfile: Object.fromEntries(
          Object.entries(item.byProfile).map(([code, portion]) => [
            code,
            { servings: String(portion.servings) },
          ]),
        ),
      };
}

/** Un alimento recién elegido: 100 g. */
export function pickedFoodRow(food: FoodDetail, key: string): FoodItemRow {
  return {
    kind: 'FOOD',
    key,
    foodId: food.id,
    foodName: food.name,
    foodState: food.state,
    measures: food.measures.map(({ id, name, grams }) => ({ id, name, grams })),
    unit: GRAMS,
    amount: '100',
    savedHouseholdText: null,
    byProfile: {},
  };
}

/** Una receta recién elegida: una porción. */
export function pickedRecipeRow(
  recipe: Pick<RecipeSummary, 'id' | 'name'>,
  key: string,
): RecipeItemRow {
  return {
    kind: 'RECIPE',
    key,
    recipeId: recipe.id,
    recipeName: recipe.name,
    servings: '1',
    byProfile: {},
  };
}

/**
 * Gramos y medida casera de un alimento, o null si la cantidad no sirve: hasta 9999 g, o hasta 100 de una medida
 * (como el recetario).
 */
export function foodItemOf(
  row: FoodItemRow,
): { grams: number; householdText: string | null } | null {
  const amount = parseDecimal(row.amount);
  if (row.unit === GRAMS) {
    return amount !== null && amount > 0 && amount <= 9_999
      ? { grams: amount, householdText: row.savedHouseholdText }
      : null;
  }
  const measure = row.measures.find((m) => m.id === row.unit);
  if (!measure || amount === null || !(amount > 0) || amount > 100) return null;
  const grams = measure.grams * amount;
  if (grams > 9_999) return null;
  return { grams, householdText: `${String(amount)} × ${measure.name}`.slice(0, 120) };
}

/** Porciones de una receta: más de 0 y hasta 99. */
export function recipeServingsOf(text: string): number | null {
  const value = parseDecimal(text);
  return value !== null && value > 0 && value <= 99 ? value : null;
}

/** Lo que dice el error de la cantidad de una fila, o undefined si sirve. */
export function itemError(row: ItemRow): string | undefined {
  if (row.kind === 'RECIPE') {
    return recipeServingsOf(row.servings) === null ? 'Más de 0 y hasta 99.' : undefined;
  }
  if (foodItemOf(row) !== null) return undefined;
  return row.unit === GRAMS ? 'Más de 0 y hasta 9999 g.' : 'Más de 0 y hasta 100.';
}

/** Gramos de un perfil: de 0 (ese día no va) a 9999. */
export function profileGramsOf(text: string): number | null {
  const value = parseDecimal(text);
  return value !== null && value >= 0 && value <= 9_999 ? value : null;
}

/** Porciones de una receta en un perfil: de 0 (ese día no va) a 99. */
export function profileServingsOf(text: string): number | null {
  const value = parseDecimal(text);
  return value !== null && value >= 0 && value <= 99 ? value : null;
}

/** Lo escrito para un perfil en una fila; '' si lleva la cantidad del plan. */
export function profileAmountText(row: ItemRow, code: string): string {
  return row.kind === 'FOOD'
    ? (row.byProfile[code]?.grams ?? '')
    : (row.byProfile[code]?.servings ?? '');
}

/** Lo que dice el error de la cantidad de un perfil, o undefined si sirve o lleva la del plan. */
export function profileAmountError(row: ItemRow, code: string): string | undefined {
  const text = profileAmountText(row, code);
  if (text.trim() === '') return undefined;
  if (row.kind === 'FOOD') return profileGramsOf(text) === null ? 'De 0 a 9999 g.' : undefined;
  return profileServingsOf(text) === null ? 'De 0 a 99.' : undefined;
}

/**
 * Cambia la cantidad de una fila en un perfil (P-20.5): vacía, vuelve a la del plan. Cambiar los gramos deja de lado la medida
 * casera con que se guardó.
 */
export function withProfileAmount<R extends ItemRow>(
  items: readonly R[],
  key: string,
  code: string,
  text: string,
): R[] {
  const others = <T>(byProfile: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(byProfile).filter(([other]) => other !== code));
  const empty = text.trim() === '';
  return items.map((row): R => {
    if (row.key !== key) return row;
    if (row.kind === 'FOOD') {
      const rest = others(row.byProfile);
      return {
        ...row,
        byProfile: empty ? rest : { ...rest, [code]: { grams: text, householdText: null } },
      };
    }
    const rest = others(row.byProfile);
    return { ...row, byProfile: empty ? rest : { ...rest, [code]: { servings: text } } };
  });
}

type ItemBody = UpdateWeeklyMenuPlan['days'][number]['meals'][number]['optionA'][number];
type FoodBody = Extract<ItemBody, { itemType: 'FOOD' }>;

/**
 * Las cantidades de cada perfil para el cuerpo, solo de los perfiles del plan (codes); null si alguna no sirve. Un perfil que ya
 * no está se deja de lado: la API no lo aceptaría.
 */
function portionsOf<T, U>(
  byProfile: Readonly<Record<string, T>>,
  codes: ReadonlySet<string>,
  parse: (amount: T) => U | null,
): Record<string, U> | null {
  const result: Record<string, U> = {};
  for (const [code, amount] of Object.entries(byProfile)) {
    if (!codes.has(code)) continue;
    const parsed = parse(amount);
    if (parsed === null) return null;
    result[code] = parsed;
  }
  return result;
}

function foodBodyOf(row: FoodItemRow, codes: ReadonlySet<string>): FoodBody | null {
  const amount = foodItemOf(row);
  const byProfile = portionsOf(row.byProfile, codes, ({ grams, householdText }) => {
    const value = profileGramsOf(grams);
    return value === null ? null : { grams: value, householdText };
  });
  return amount && byProfile
    ? { itemType: 'FOOD', foodId: row.foodId, ...amount, byProfile }
    : null;
}

function itemBodyOf(row: ItemRow, codes: ReadonlySet<string>): ItemBody | null {
  if (row.kind === 'FOOD') return foodBodyOf(row, codes);
  const servings = recipeServingsOf(row.servings);
  const byProfile = portionsOf(row.byProfile, codes, ({ servings: text }) => {
    const value = profileServingsOf(text);
    return value === null ? null : { servings: value };
  });
  return servings === null || byProfile === null
    ? null
    : { itemType: 'RECIPE', recipeId: row.recipeId, servings, byProfile };
}

/** Todos o null: basta uno que no sirva para no pedir la vista previa. */
function allOrNull<T, U>(values: readonly T[], map: (value: T) => U | null): U[] | null {
  const result: U[] = [];
  for (const value of values) {
    const mapped = map(value);
    if (mapped === null) return null;
    result.push(mapped);
  }
  return result;
}

type HeaderBody = UpdateWeeklyMenuPlan['meals'][number];

function headerBodyOf(meal: MealHeaderRow): HeaderBody | null {
  const name = meal.name.trim();
  const sharePct = sharePctOf(meal.sharePct);
  if (name === '' || name.length > 60 || sharePct === null || !isTimeOfDay(meal.timeOfDay)) {
    return null;
  }
  return {
    slotCode: meal.slotCode,
    name,
    timeOfDay: meal.timeOfDay === '' ? null : meal.timeOfDay,
    sharePct,
  };
}

/** Hidratación, indicaciones y los perfiles de día, o null si no sirven. */
function columnsOf(draft: Pick<CompositionDraft, 'hydrationMl' | 'instructions' | 'dayProfiles'>): {
  hydrationTargetMl: number | null;
  instructions: string | null;
  dayProfiles: DayProfileInput[];
} | null {
  const hydrationTargetMl = hydrationOf(draft.hydrationMl);
  const instructions = draft.instructions.trim();
  const dayProfiles = dayProfilesBody(draft.dayProfiles);
  if (hydrationTargetMl === undefined || dayProfiles === null || instructions.length > 2_000) {
    return null;
  }
  return {
    hydrationTargetMl,
    instructions: instructions === '' ? null : instructions,
    dayProfiles,
  };
}

/** La composición guardada, lista para editarse; measures trae las medidas caseras de cada alimento. */
export function compositionDraftOf(
  plan: Pick<
    CompositionNutritionPlan,
    'meals' | 'hydrationTargetMl' | 'instructions' | 'dayProfiles'
  >,
  measures: Measures = {},
): CompositionDraft {
  return {
    meals: plan.meals.map((meal) => ({
      ...headerOf(meal, meal.id),
      items: meal.items.map((item, i) => savedFoodRow(item, `${meal.id}-${String(i)}`, measures)),
    })),
    hydrationMl: plan.hydrationTargetMl === null ? '' : String(plan.hydrationTargetMl),
    instructions: plan.instructions ?? '',
    dayProfiles: dayProfileRowsOf(plan.dayProfiles),
  };
}

/**
 * El cuerpo de PUT y de la vista previa de una composición, o null mientras algo falte o no sea un número válido. Las
 * reglas del plan (porcentajes que suman 100) las decide la API y las explica en su 422.
 */
export function compositionBody(draft: CompositionDraft): UpdateCompositionPlan | null {
  const columns = columnsOf(draft);
  const codes = new Set(columns?.dayProfiles.map((profile) => profile.code));
  const meals = allOrNull(draft.meals, (meal) => {
    const header = headerBodyOf(meal);
    const items = allOrNull(meal.items, (row) => foodBodyOf(row, codes));
    return header && items ? { ...header, items } : null;
  });
  return columns && meals ? { modality: 'COMPOSITION', meals, ...columns } : null;
}

/** El menú guardado, listo para editarse. */
export function menuDraftOf(
  plan: Pick<
    WeeklyMenuNutritionPlan,
    'meals' | 'days' | 'hydrationTargetMl' | 'instructions' | 'dayProfiles'
  >,
  measures: Measures = {},
): MenuDraft {
  return {
    meals: plan.meals.map((meal, m) => headerOf(meal, `tiempo-${String(m)}`)),
    days: plan.days.map((day) => ({
      cells: day.meals.map((cell) => ({
        optionA: cell.optionA.map((item, i) =>
          savedItemRow(item, `${cell.id}-A-${String(i)}`, measures),
        ),
        optionB: cell.optionB.map((item, i) =>
          savedItemRow(item, `${cell.id}-B-${String(i)}`, measures),
        ),
      })),
    })),
    hydrationMl: plan.hydrationTargetMl === null ? '' : String(plan.hydrationTargetMl),
    instructions: plan.instructions ?? '',
    dayProfiles: dayProfileRowsOf(plan.dayProfiles),
  };
}

/** El cuerpo de PUT y de la vista previa de un menú, o null mientras algo falte o no sea un número válido. */
export function menuBody(draft: MenuDraft): UpdateWeeklyMenuPlan | null {
  const columns = columnsOf(draft);
  const codes = new Set(columns?.dayProfiles.map((profile) => profile.code));
  const meals = allOrNull(draft.meals, headerBodyOf);
  const days = allOrNull(draft.days, (day) => {
    const cells = allOrNull(day.cells, (cell) => {
      const optionA = allOrNull(cell.optionA, (row) => itemBodyOf(row, codes));
      const optionB = allOrNull(cell.optionB, (row) => itemBodyOf(row, codes));
      return optionA && optionB ? { optionA, optionB } : null;
    });
    return cells ? { meals: cells } : null;
  });
  return columns && meals && days ? { modality: 'WEEKLY_MENU', meals, days, ...columns } : null;
}

const NEW_MEAL = { slotCode: 'CUSTOM', name: '', timeOfDay: '', sharePct: '0' } as const;

/** Cambia el nombre, la hora o el % de un tiempo; en el menú vale para los siete días. */
export function withHeaderChange<D extends { readonly meals: readonly MealHeaderRow[] }>(
  draft: D,
  key: string,
  change: Partial<Pick<MealHeaderRow, 'name' | 'timeOfDay' | 'sharePct'>>,
): D {
  return { ...draft, meals: draft.meals.map((m) => (m.key === key ? { ...m, ...change } : m)) };
}

/** Un tiempo nuevo al final, sin nombre ni porcentaje y sin alimentos. */
export function withCompositionMeal(draft: CompositionDraft, key: string): CompositionDraft {
  return { ...draft, meals: [...draft.meals, { key, ...NEW_MEAL, items: [] }] };
}

export function withoutCompositionMeal(draft: CompositionDraft, key: string): CompositionDraft {
  return { ...draft, meals: draft.meals.filter((m) => m.key !== key) };
}

export function withCompositionItems(
  draft: CompositionDraft,
  mealKey: string,
  update: (items: readonly FoodItemRow[]) => readonly FoodItemRow[],
): CompositionDraft {
  return {
    ...draft,
    meals: draft.meals.map((m) => (m.key === mealKey ? { ...m, items: update(m.items) } : m)),
  };
}

/** Un tiempo nuevo al final del menú: una celda vacía en cada día. */
export function withMenuMeal(draft: MenuDraft, key: string): MenuDraft {
  return {
    ...draft,
    meals: [...draft.meals, { key, ...NEW_MEAL }],
    days: draft.days.map((day) => ({ cells: [...day.cells, { optionA: [], optionB: [] }] })),
  };
}

/** Quita un tiempo del menú y su celda de cada día. */
export function withoutMenuMeal(draft: MenuDraft, key: string): MenuDraft {
  const index = draft.meals.findIndex((m) => m.key === key);
  if (index < 0) return draft;
  return {
    ...draft,
    meals: draft.meals.filter((m) => m.key !== key),
    days: draft.days.map((day) => ({ cells: day.cells.filter((_, i) => i !== index) })),
  };
}

export function withCellItems(
  draft: MenuDraft,
  day: number,
  meal: number,
  option: MenuOption,
  update: (items: readonly ItemRow[]) => readonly ItemRow[],
): MenuDraft {
  return {
    ...draft,
    days: draft.days.map((d, i) =>
      i === day
        ? {
            cells: d.cells.map((cell, m) =>
              m === meal ? { ...cell, [option]: update(cell[option]) } : cell,
            ),
          }
        : d,
    ),
  };
}

/** Copia lo de un día a los otros seis, con keys nuevas para cada fila. */
export function withDayCopiedToAll(
  draft: MenuDraft,
  from: number,
  newKey: () => string,
): MenuDraft {
  const source = draft.days[from];
  if (!source) return draft;
  const copy = () => ({
    cells: source.cells.map((cell) => ({
      optionA: cell.optionA.map((row) => ({ ...row, key: newKey() })),
      optionB: cell.optionB.map((row) => ({ ...row, key: newKey() })),
    })),
  });
  return { ...draft, days: draft.days.map((day, i) => (i === from ? day : copy())) };
}

/** Cambiar la cantidad o la medida de un alimento olvida la medida con que se guardó. */
export function withItemChange<R extends ItemRow>(
  items: readonly R[],
  key: string,
  change: Partial<FoodItemRow> | Partial<RecipeItemRow>,
): R[] {
  return items.map((row) =>
    row.key === key
      ? { ...row, ...(row.kind === 'FOOD' ? { savedHouseholdText: null } : {}), ...change }
      : row,
  );
}
