import type {
  CompositionPlanPreview,
  ExchangePlanPreview,
  ItemTotals,
  MenuItemView,
  NutritionPlan,
  NutritionPlanPreview,
  WeeklyMenuPlanPreview,
} from '@nutricoach/contracts';
import type {
  ItemTotals as CalculatedTotals,
  FoodAdequacyBlock,
} from '../../../application/food-plan-calculation.js';
import type { ExchangeAdequacy } from '../../../application/plan-calculation.js';
import type {
  CompositionPlanDocument,
  DocumentDayProfile,
  DocumentMenuItem,
  ExchangePlanDocument,
  PlanDocument,
  WeeklyMenuPlanDocument,
} from '../../../application/plan-document.js';
import type {
  NutritionPlanPreviewView,
  NutritionPlanView,
} from '../../../application/queries/nutrition-plan.queries.js';

const methodsOf = (document: PlanDocument) =>
  document.methods.map((m) => ({ ...m, warnings: m.warnings.map((w) => ({ ...w })) }));

/**
 * Los perfiles de día con sus metas, su método y sus porciones (07 §2, P-20.5); un snapshot de la versión 1 o 2 no los trae
 * (una sola meta) y uno de la 3 no trae sus porciones (null: las del plan).
 */
function dayProfilesOf<TPortions, TView>(
  profiles: readonly DocumentDayProfile<TPortions>[] | undefined,
  portionsOf: (portions: TPortions) => TView,
) {
  return (profiles ?? []).map((profile) => ({
    code: profile.code,
    name: profile.name,
    kcal: profile.kcal,
    choG: profile.choG,
    proteinG: profile.proteinG,
    fatG: profile.fatG,
    method: { ...profile.method, warnings: profile.method.warnings.map((w) => ({ ...w })) },
    portions: profile.portions === undefined ? null : portionsOf(profile.portions),
  }));
}

const totalsOf = (totals: CalculatedTotals): ItemTotals => ({
  ingredientCount: totals.ingredientCount,
  nutrients: Object.fromEntries(
    Object.entries(totals.nutrients).map(([code, total]) => [code, { ...total }]),
  ),
});

const foodAdequacyOf = (adequacy: FoodAdequacyBlock) => ({
  rangePct: [adequacy.rangePct[0], adequacy.rangePct[1]] as [number, number],
  kcal: { ...adequacy.kcal },
  cho: { ...adequacy.cho },
  protein: { ...adequacy.protein },
  fat: { ...adequacy.fat },
});

const adequacyOf = (document: CompositionPlanDocument | WeeklyMenuPlanDocument) =>
  foodAdequacyOf(document.adequacy);

const exchangeAdequacyOf = (adequacy: ExchangeAdequacy) => ({
  rangePct: [adequacy.rangePct[0], adequacy.rangePct[1]] as [number, number],
  kcal: { ...adequacy.kcal },
  cho: { ...adequacy.cho },
  protein: { ...adequacy.protein },
  fat: { ...adequacy.fat },
});

/** Intercambios: lo que calcula el motor, sin redondear (RN-D09), y cada cálculo con su método (RN-D01, RN-D02). */
function exchangeCalculation(
  document: ExchangePlanDocument,
  publishProblems: readonly string[],
): Omit<ExchangePlanPreview, 'meals'> {
  return {
    modality: 'EXCHANGES',
    targets: { ...document.targets },
    dayProfiles: dayProfilesOf(document.dayProfiles, (portions) => ({
      starchByMeal: [...portions.starchByMeal],
      manual: portions.manual,
      totals: { ...portions.totals },
      adequacy: exchangeAdequacyOf(portions.adequacy),
    })),
    exchanges: document.exchanges.map((e) => ({ ...e })),
    manualSplit: [...document.manualSplit],
    totals: { ...document.totals },
    adequacy: exchangeAdequacyOf(document.adequacy),
    methods: methodsOf(document),
    publishProblems: [...publishProblems],
  };
}

/** Energía, macronutrientes y fibra: los nutrientes principales del catálogo, para mostrar cada fila. */
function coreOf(
  document: CompositionPlanDocument | WeeklyMenuPlanDocument,
  value: (code: string) => number | null,
): Record<string, number | null> {
  return Object.fromEntries(
    document.nutrients.filter((n) => n.core).map(({ code }) => [code, value(code)]),
  );
}

function itemOf(
  document: CompositionPlanDocument | WeeklyMenuPlanDocument,
  item: DocumentMenuItem,
): MenuItemView {
  if (item.itemType === 'FOOD') {
    const food = document.foods[item.foodId];
    return {
      itemType: 'FOOD',
      foodId: item.foodId,
      grams: item.grams,
      householdText: item.householdText,
      byProfile: Object.fromEntries(
        Object.entries(item.byProfile ?? {}).map(([code, portion]) => [code, { ...portion }]),
      ),
      foodName: item.foodName,
      state: food?.state ?? 'READY',
      nutrientsPer100g: coreOf(document, (code) => food?.nutrientsPer100g[code] ?? null),
    };
  }
  const recipes = document.modality === 'WEEKLY_MENU' ? document.recipes : {};
  const perServing = recipes[item.recipeId]?.perServing.nutrients;
  return {
    itemType: 'RECIPE',
    recipeId: item.recipeId,
    servings: item.servings,
    byProfile: Object.fromEntries(
      Object.entries(item.byProfile ?? {}).map(([code, portion]) => [code, { ...portion }]),
    ),
    recipeName: item.recipeName,
    nutrientsPerServing: coreOf(document, (code) => perServing?.[code]?.value ?? null),
  };
}

function compositionCalculation(
  document: CompositionPlanDocument,
  publishProblems: readonly string[],
): CompositionPlanPreview {
  return {
    modality: 'COMPOSITION',
    targets: { ...document.targets },
    dayProfiles: dayProfilesOf(document.dayProfiles, (portions) => ({
      totals: totalsOf(portions.totals),
      adequacy: foodAdequacyOf(portions.adequacy),
    })),
    nutrients: document.nutrients.map((n) => ({ ...n })),
    meals: document.meals.map((meal) => ({
      slotCode: meal.slotCode,
      name: meal.name,
      timeOfDay: meal.timeOfDay,
      sharePct: meal.sharePct,
      items: meal.items.map((item) => {
        const view = itemOf(document, item);
        if (view.itemType !== 'FOOD') throw new Error('Una composición solo tiene alimentos.');
        return view;
      }),
      totals: totalsOf(meal.totals),
    })),
    totals: totalsOf(document.totals),
    adequacy: adequacyOf(document),
    methods: methodsOf(document),
    publishProblems: [...publishProblems],
  };
}

function weeklyMenuCalculation(
  document: WeeklyMenuPlanDocument,
  publishProblems: readonly string[],
): WeeklyMenuPlanPreview {
  return {
    modality: 'WEEKLY_MENU',
    targets: { ...document.targets },
    dayProfiles: dayProfilesOf(document.dayProfiles, (portions) => ({
      weeklyAverage: Object.fromEntries(
        Object.entries(portions.weeklyAverage).map(([code, average]) => [code, { ...average }]),
      ),
      adequacy: foodAdequacyOf(portions.adequacy),
    })),
    nutrients: document.nutrients.map((n) => ({ ...n })),
    meals: document.meals.map((meal) => ({ ...meal })),
    days: document.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      meals: day.meals.map((cell) => ({
        optionA: cell.optionA.map((item) => itemOf(document, item)),
        optionB: cell.optionB.map((item) => itemOf(document, item)),
        totalsA: cell.totalsA && totalsOf(cell.totalsA),
        totalsB: cell.totalsB && totalsOf(cell.totalsB),
      })),
      totals: totalsOf(day.totals),
    })),
    weeklyAverage: Object.fromEntries(
      Object.entries(document.weeklyAverage).map(([code, average]) => [code, { ...average }]),
    ),
    adequacy: adequacyOf(document),
    methods: methodsOf(document),
    publishProblems: [...publishProblems],
  };
}

/** Un borrador calculado sin guardar, para el editor (RN-E10). */
export function previewOf(view: NutritionPlanPreviewView): NutritionPlanPreview {
  const { document, publishProblems } = view;
  switch (document.modality) {
    case 'EXCHANGES':
      return {
        ...exchangeCalculation(document, publishProblems),
        meals: document.meals.map((meal) => ({ servings: { ...meal.servings } })),
      };
    case 'COMPOSITION':
      return compositionCalculation(document, publishProblems);
    case 'WEEKLY_MENU':
      return weeklyMenuCalculation(document, publishProblems);
  }
}

/** El plan con lo que calcula el motor. Lo publicado sale tal cual de su snapshot. */
export function planOf(view: NutritionPlanView): NutritionPlan {
  const { record, document } = view;
  const base = {
    id: record.id,
    patientId: record.patientId,
    lineageId: record.lineageId,
    versionNo: record.versionNo,
    status: record.status,
    energyPrescriptionId: record.energyPrescriptionId,
    hydrationTargetMl: document.hydrationTargetMl,
    instructions: document.instructions,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    publishedAt: record.publishedAt?.toISOString() ?? null,
    validFrom: record.validFrom,
    version: record.version,
  };
  switch (document.modality) {
    case 'EXCHANGES':
      return {
        ...base,
        ...exchangeCalculation(document, view.publishProblems),
        exchangeList: {
          ...document.exchangeList,
          groups: document.exchangeList.groups.map((g) => ({ ...g })),
        },
        meals: document.meals.map((meal) => ({
          id: meal.id,
          slotCode: meal.slotCode,
          name: meal.name,
          timeOfDay: meal.timeOfDay,
          sharePct: meal.sharePct,
          servings: { ...meal.servings },
          allowedFoods: meal.allowedFoods.map((food) => ({
            groupCode: food.groupCode,
            foodId: food.foodId,
            foodName: food.foodName,
            grams: food.grams,
            householdText: food.householdText,
            nutrientsPer100g: { ...food.nutrientsPer100g },
          })),
        })),
      };
    case 'COMPOSITION': {
      const calculation = compositionCalculation(document, view.publishProblems);
      return {
        ...base,
        ...calculation,
        meals: calculation.meals.map((meal, i) => ({ ...meal, id: document.meals[i]?.id ?? '' })),
      };
    }
    case 'WEEKLY_MENU': {
      const calculation = weeklyMenuCalculation(document, view.publishProblems);
      return {
        ...base,
        ...calculation,
        days: calculation.days.map((day, d) => ({
          ...day,
          meals: day.meals.map((cell, m) => ({
            ...cell,
            id: document.days[d]?.meals[m]?.id ?? '',
          })),
        })),
      };
    }
  }
}
