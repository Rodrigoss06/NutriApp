import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

/** Grupos del método clásico (RN-E08), en el orden de la lista. */
export const EXCHANGE_GROUP_CODES = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
export type ExchangeGroupCode = (typeof EXCHANGE_GROUP_CODES)[number];
export type FixedGroup = 'VEG' | 'FRU' | 'MILK';
export type SolvedGroup = 'STA' | 'MEAT' | 'FAT';

export type MealSlotCode =
  'BREAKFAST' | 'MID_MORNING' | 'LUNCH' | 'AFTERNOON' | 'DINNER' | 'CUSTOM';
export type PlanStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
/** Las tres formas de prescribir: intercambios (RF-19), composición (RF-20) y menú semanal (RF-21). */
export type PlanModality = 'EXCHANGES' | 'COMPOSITION' | 'WEEKLY_MENU';

/** Lo que el paciente puede elegir en un tiempo y grupo, con su porción en gramos de parte comestible (RN-G05). */
export interface AllowedFoodDraft {
  readonly groupCode: ExchangeGroupCode;
  readonly foodId: string;
  readonly grams: number;
  readonly householdText: string | null;
}

export interface MealDraft {
  readonly slotCode: MealSlotCode;
  readonly name: string;
  /** HH:MM, hora local del paciente. */
  readonly timeOfDay: string | null;
  readonly sharePct: number;
  readonly allowedFoods: readonly AllowedFoodDraft[];
}

/** El borrador tal como lo escribe el profesional. */
export interface PlanDraftInput {
  readonly fixedServings: Readonly<Record<FixedGroup, number>>;
  readonly overrides: Readonly<Partial<Record<SolvedGroup, number>>>;
  readonly meals: readonly MealDraft[];
  /** El reparto a mano de un grupo: un valor por tiempo de comida, en su orden. */
  readonly splitOverrides: Readonly<Partial<Record<ExchangeGroupCode, readonly number[]>>>;
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

/** Lo que el dominio toma del motor; lo calcula la aplicación. */
export interface PlanMethods {
  /** EXCHANGES_CLASSIC con los grupos fijos del borrador (RN-E08). */
  readonly automaticServings: Readonly<Record<ExchangeGroupCode, number>>;
  /** MEAL_SPLIT_LARGEST_REMAINDER de un total con los porcentajes de los tiempos, en su orden (RN-E09). */
  readonly split: (total: number) => readonly number[];
}

export interface DailyExchange {
  readonly groupCode: ExchangeGroupCode;
  readonly servings: number;
  /** Lo que daba el método clásico. */
  readonly automatic: number;
  readonly manual: boolean;
}

export interface PlannedMeal extends MealDraft {
  readonly servings: Readonly<Record<ExchangeGroupCode, number>>;
}

/** Un plan por intercambios válido: intercambios del día, su reparto por tiempos y los alimentos permitidos. */
export interface ExchangePlan {
  readonly exchanges: readonly DailyExchange[];
  readonly meals: readonly PlannedMeal[];
  readonly manualSplit: readonly ExchangeGroupCode[];
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

/** Los tiempos con que empieza un plan: los de G-19, que el profesional cambia. */
export const DEFAULT_MEALS: readonly MealDraft[] = [
  { slotCode: 'BREAKFAST', name: 'Desayuno', timeOfDay: null, sharePct: 25, allowedFoods: [] },
  {
    slotCode: 'MID_MORNING',
    name: 'Media mañana',
    timeOfDay: null,
    sharePct: 10,
    allowedFoods: [],
  },
  { slotCode: 'LUNCH', name: 'Almuerzo', timeOfDay: null, sharePct: 35, allowedFoods: [] },
  { slotCode: 'AFTERNOON', name: 'Media tarde', timeOfDay: null, sharePct: 10, allowedFoods: [] },
  { slotCode: 'DINNER', name: 'Cena', timeOfDay: null, sharePct: 20, allowedFoods: [] },
];

export const PLAN_NOT_FOUND = domainError({
  code: 'NC-NUT-006',
  message: 'No encontramos ese plan.',
});
/** Publicado es inmutable: editarlo crea una versión nueva en borrador (RN-E15). */
export const PLAN_NOT_DRAFT = domainError({
  code: 'NC-NUT-007',
  rule: 'RN-E15',
  message: 'Un plan publicado no se edita: crea una versión nueva.',
});
export const PLAN_VERSION_CONFLICT = domainError({
  code: 'NC-NUT-008',
  message: 'El plan cambió mientras lo editabas: vuelve a abrirlo.',
});
/** La lista no existe, no está publicada o le faltan grupos del método clásico (RN-E11). */
export const EXCHANGE_LIST_UNAVAILABLE = domainError({
  code: 'NC-NUT-009',
  rule: 'RN-E11',
  message: 'Esa lista de intercambio no está disponible o le faltan grupos.',
});
export const INVALID_PLAN = 'NC-NUT-010';
/** Lo que falta para publicar, en details.problems (RN-E13, RN-G05). */
export const planNotReady = (problems: readonly string[]): DomainError =>
  domainError({
    code: 'NC-NUT-012',
    message: 'Al plan le falta algo para publicarlo.',
    details: { problems },
  });
/** Un plan tiene a lo más una versión en borrador: se edita esa (02 §7). */
export const DRAFT_EXISTS = 'NC-NUT-013';
export const draftExists = (draftId: string): DomainError =>
  domainError({
    code: DRAFT_EXISTS,
    message: 'Este plan ya tiene una versión en borrador: edítala.',
    details: { draftId },
  });
/** La modalidad se elige al crear el plan y no cambia: el borrador que llega debe ser de esa. */
export const PLAN_MODALITY_MISMATCH = domainError({
  code: 'NC-NUT-014',
  message: 'Ese borrador es de otra modalidad que la del plan.',
});
/** Un ERROR del motor al calcular el plan, con su regla y su código NC-ENG (RN-D06). */
export const PLAN_RULE = (issue: {
  readonly rule: string;
  readonly code: string;
  readonly message: string;
  readonly methodCode: string;
}): DomainError =>
  domainError({
    code: 'NC-NUT-011',
    ...(/^RN-[A-Z]\d{2}$/.test(issue.rule) ? { rule: issue.rule as `RN-${string}` } : {}),
    message: issue.message,
    details: { methodCode: issue.methodCode, engineCode: issue.code },
  });

/** El plan no cuadra: cada problema dice qué y cita su regla. */
export const invalidPlan = (problems: readonly string[]): DomainError =>
  domainError({
    code: INVALID_PLAN,
    message: 'El plan tiene datos que no cuadran.',
    details: { problems },
  });

/** Con centésimas: 33.33 + 33.33 + 33.34 es 100 aunque la suma en coma flotante no lo sea. */
const hundredths = (value: number): number => Math.round(value * 100);

/**
 * Un plan por intercambios (02 §7): intercambios enteros y no negativos con el método clásico y el ajuste a mano
 * (RN-E08); tiempos cuyos porcentajes suman 100 y un reparto que, por grupo, suma el total del día (RN-E09); y
 * alimentos permitidos solo donde el grupo tiene intercambios, sin repetirse (RN-G05).
 */
export function exchangePlan(
  input: PlanDraftInput,
  methods: PlanMethods,
  groupNames: Readonly<Record<ExchangeGroupCode, string>>,
): Result<ExchangePlan, DomainError> {
  const exchanges = EXCHANGE_GROUP_CODES.map((groupCode): DailyExchange => {
    const automatic = methods.automaticServings[groupCode];
    if (groupCode === 'VEG' || groupCode === 'FRU' || groupCode === 'MILK') {
      const servings = input.fixedServings[groupCode];
      return { groupCode, servings, automatic: servings, manual: false };
    }
    const override = input.overrides[groupCode];
    return override === undefined
      ? { groupCode, servings: automatic, automatic, manual: false }
      : { groupCode, servings: override, automatic, manual: true };
  });

  const shareTotal = input.meals.reduce((sum, meal) => sum + hundredths(meal.sharePct), 0);
  if (shareTotal !== 10_000) {
    return err(
      invalidPlan([
        `Los porcentajes de los tiempos de comida suman ${String(shareTotal / 100)}: deben sumar 100 (RN-E09).`,
      ]),
    );
  }

  const problems: string[] = [];
  const grid = new Map<ExchangeGroupCode, readonly number[]>();
  const manualSplit: ExchangeGroupCode[] = [];
  for (const { groupCode, servings } of exchanges) {
    const manual = input.splitOverrides[groupCode];
    if (manual === undefined) {
      grid.set(groupCode, methods.split(servings));
      continue;
    }
    const name = groupNames[groupCode];
    if (manual.length !== input.meals.length) {
      problems.push(
        `${name}: el reparto necesita un valor por cada uno de los ${String(input.meals.length)} tiempos de comida (RN-E09).`,
      );
      continue;
    }
    const sum = manual.reduce((total, value) => total + value, 0);
    if (sum !== servings) {
      problems.push(
        `${name}: el reparto suma ${String(sum)} y el total del día es ${String(servings)} (RN-E09).`,
      );
      continue;
    }
    grid.set(groupCode, manual);
    manualSplit.push(groupCode);
  }

  const meals = input.meals.map((meal, index): PlannedMeal => {
    const servings = Object.fromEntries(
      EXCHANGE_GROUP_CODES.map((code) => [code, grid.get(code)?.[index] ?? 0]),
    ) as Record<ExchangeGroupCode, number>;
    const seen = new Set<string>();
    for (const food of meal.allowedFoods) {
      const key = `${food.groupCode}:${food.foodId}`;
      if (seen.has(key)) {
        problems.push(`${meal.name}: un alimento se repite en ${groupNames[food.groupCode]}.`);
      }
      seen.add(key);
    }
    for (const groupCode of new Set(meal.allowedFoods.map((food) => food.groupCode))) {
      if (grid.has(groupCode) && servings[groupCode] === 0) {
        problems.push(
          `${meal.name}: ${groupNames[groupCode]} no tiene intercambios en este tiempo; quita sus alimentos permitidos (RN-G05).`,
        );
      }
    }
    return { ...meal, sharePct: hundredths(meal.sharePct) / 100, servings };
  });

  if (problems.length > 0) return err(invalidPlan(problems));
  return ok({
    exchanges,
    meals,
    manualSplit,
    hydrationTargetMl: input.hydrationTargetMl,
    instructions: input.instructions,
  });
}

/**
 * Lo que falta para publicar (RN-E13, RN-G05): la meta de hidratación y, en cada tiempo, al menos un alimento
 * permitido de cada grupo con intercambios. Sin alimentos, el paciente no puede registrar desde su plan.
 */
export function publishProblems(
  plan: ExchangePlan,
  groupNames: Readonly<Record<ExchangeGroupCode, string>>,
): readonly string[] {
  const problems: string[] = [];
  if (plan.hydrationTargetMl === null) problems.push('Falta la meta de hidratación (RN-E13).');
  for (const meal of plan.meals) {
    for (const groupCode of EXCHANGE_GROUP_CODES) {
      if (
        meal.servings[groupCode] > 0 &&
        !meal.allowedFoods.some((f) => f.groupCode === groupCode)
      ) {
        problems.push(
          `${meal.name}: falta al menos un alimento permitido de ${groupNames[groupCode]} (RN-G05).`,
        );
      }
    }
  }
  return problems;
}
