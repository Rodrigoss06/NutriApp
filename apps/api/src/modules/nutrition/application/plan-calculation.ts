import {
  ADEQUACY,
  EXCHANGES_CLASSIC,
  kcalOfMacros,
  MEAL_SPLIT_LARGEST_REMAINDER,
  runMethod,
  STARCH_BY_DAY_PROFILE,
  type AnyMethod,
  type Issue,
  type MethodCode,
} from '@nutricoach/engine';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import {
  EXCHANGE_GROUP_CODES,
  exchangePlan,
  PLAN_RULE,
  type ExchangeGroupCode,
  type ExchangePlan,
  type PlanDraftInput,
  type PlannedMeal,
} from '../domain/nutrition-plan.js';

/** Las metas exactas del plan, las de su prescripción (RN-E07): sin redondear (RN-D09). */
export interface PlanTargets {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

export interface PlanListGroup {
  readonly code: ExchangeGroupCode;
  readonly name: string;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
  readonly kcal: number;
}

/** La lista de intercambio y su versión (RN-E11). */
export interface PlanList {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly version: string;
  readonly provisional: boolean;
  readonly groups: readonly PlanListGroup[];
}

/** El sobre de un cálculo del motor (RN-D01): método, versión, hash de los insumos y avisos. */
export interface PlanMethodRun {
  readonly methodCode: MethodCode;
  readonly methodVersion: string;
  readonly inputsHash: string;
  readonly warnings: readonly Issue[];
}

export interface Adequacy {
  readonly pct: number;
  readonly inRange: boolean;
}

export interface MacroTotals {
  readonly kcal: number;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

export interface ExchangeAdequacy {
  readonly rangePct: readonly [number, number];
  readonly kcal: Adequacy;
  readonly cho: Adequacy;
  readonly protein: Adequacy;
  readonly fat: Adequacy;
}

/**
 * Las porciones de un perfil de día (07 §2, P-20.5): sus almidones por tiempo, los totales del plan con ellos y la adecuación
 * frente a las metas del perfil (RN-E10).
 */
export interface ExchangeProfileCalculation {
  readonly code: string;
  readonly starchByMeal: readonly number[];
  /** El coach cambió la sugerencia de STARCH_BY_DAY_PROFILE. */
  readonly manual: boolean;
  readonly totals: MacroTotals;
  readonly adequacy: ExchangeAdequacy;
}

export interface PlanCalculation {
  readonly plan: ExchangePlan;
  readonly totals: MacroTotals;
  readonly adequacy: ExchangeAdequacy;
  /** Uno por perfil de día, en su orden. */
  readonly profiles: readonly ExchangeProfileCalculation[];
  readonly methods: readonly PlanMethodRun[];
}

/** Las metas de un perfil de día por su código (07 §2). */
export type ProfileTargets = PlanTargets & { readonly code: string };

type Run<T> =
  | { readonly ok: true; readonly outputs: T; readonly method: PlanMethodRun }
  | { readonly ok: false; readonly error: DomainError };

/** Un método del motor con su sobre (RN-D01); un ERROR sale como error del plan con su regla (RN-D06). */
export function runPlanMethod<T>(method: AnyMethod, inputs: Record<string, unknown>): Run<T> {
  const result = runMethod(method, inputs as never);
  if (!result.ok) {
    const [issue] = result.errors;
    if (!issue) throw new Error(`${method.code} falló sin aviso.`);
    return { ok: false, error: PLAN_RULE({ ...issue, methodCode: method.code }) };
  }
  return {
    ok: true,
    outputs: result.result.outputs as T,
    method: {
      methodCode: result.result.methodCode,
      methodVersion: result.result.methodVersion,
      inputsHash: result.result.inputsHash,
      warnings: result.result.warnings,
    },
  };
}

/**
 * Un plan por intercambios con el motor: el método clásico con los grupos fijos (RN-E08), el reparto de cada grupo por
 * el mayor residuo (RN-E09) y la adecuación de kcal y de cada macronutriente frente a las metas, con el rango de la
 * organización (RN-E10). Cada perfil de día lleva sus almidones por tiempo, sugeridos por STARCH_BY_DAY_PROFILE o del coach,
 * y su adecuación frente a sus metas (P-20.5). Los ajustes a mano y las reglas del plan los decide el dominio.
 */
export function calculatePlan(
  input: PlanDraftInput,
  targets: PlanTargets,
  list: PlanList,
  rangePct: readonly [number, number],
  profileTargets: readonly ProfileTargets[] = [],
): Result<PlanCalculation, DomainError> {
  const exchanges = runPlanMethod<{ servings: Record<ExchangeGroupCode, number> }>(
    EXCHANGES_CLASSIC,
    {
      target: { choG: targets.choG, proteinG: targets.proteinG, fatG: targets.fatG },
      fixedServings: input.fixedServings,
      list: {
        code: list.code,
        version: list.version,
        provisional: list.provisional,
        groups: list.groups.map(({ code, choG, proteinG, fatG }) => ({
          code,
          choG,
          proteinG,
          fatG,
        })),
      },
    },
  );
  if (!exchanges.ok) return err(exchanges.error);

  const splits: PlanMethodRun[] = [];
  const meals = input.meals.map((meal, index) => ({ meal: String(index), pct: meal.sharePct }));
  const split = (total: number): readonly number[] => {
    const result = runPlanMethod<{ servingsByMeal: { servings: number }[] }>(
      MEAL_SPLIT_LARGEST_REMAINDER,
      {
        totalServings: total,
        meals,
      },
    );
    // El dominio reparte solo con porcentajes que suman 100 y totales enteros: un ERROR aquí es una falla técnica.
    if (!result.ok) throw new Error(`Reparto imposible: ${result.error.message}`);
    splits.push(result.method);
    return result.outputs.servingsByMeal.map((row) => row.servings);
  };
  const names = Object.fromEntries(list.groups.map((g) => [g.code, g.name])) as Record<
    ExchangeGroupCode,
    string
  >;
  const byCode = new Map(list.groups.map((g) => [g.code, g]));
  const starchRuns: PlanMethodRun[] = [];
  const starchErrors: DomainError[] = [];
  const profileStarch = (
    profile: { readonly choG: number },
    planned: readonly PlannedMeal[],
  ): readonly number[] => {
    const base = planned.map((meal) => meal.servings.STA);
    const baseChoG = planned.reduce(
      (total, meal) =>
        total +
        EXCHANGE_GROUP_CODES.reduce(
          (sum, code) => sum + meal.servings[code] * (byCode.get(code)?.choG ?? 0),
          0,
        ),
      0,
    );
    const result = runPlanMethod<{ servingsByMeal: { servings: number }[] }>(
      STARCH_BY_DAY_PROFILE,
      {
        baseChoG,
        profileChoG: profile.choG,
        starchChoG: byCode.get('STA')?.choG ?? 0,
        meals: planned.map((meal, index) => ({
          meal: String(index),
          slotCode: meal.slotCode,
          starch: meal.servings.STA,
        })),
      },
    );
    if (!result.ok) {
      starchErrors.push(result.error);
      return base;
    }
    starchRuns.push(result.method);
    return result.outputs.servingsByMeal.map((row) => row.servings);
  };
  const plan = exchangePlan(
    input,
    { automaticServings: exchanges.outputs.servings, split, profileStarch },
    names,
  );
  if (!plan.ok) return plan;
  const [starchError] = starchErrors;
  if (starchError) return err(starchError);

  const sum = (
    macro: 'choG' | 'proteinG' | 'fatG',
    servingsOf: (code: ExchangeGroupCode, servings: number) => number,
  ): number =>
    plan.value.exchanges.reduce(
      (total, e) =>
        total + servingsOf(e.groupCode, e.servings) * (byCode.get(e.groupCode)?.[macro] ?? 0),
      0,
    );
  const totalsWith = (servingsOf: (code: ExchangeGroupCode, servings: number) => number) => {
    const macros = {
      choG: sum('choG', servingsOf),
      proteinG: sum('proteinG', servingsOf),
      fatG: sum('fatG', servingsOf),
    };
    return { ...macros, kcal: kcalOfMacros(macros) };
  };
  const totals = totalsWith((_, servings) => servings);

  const adequacyRuns: PlanMethodRun[] = [];
  const adequacy = (prescribed: number, planned: number): Result<Adequacy, DomainError> => {
    const result = runPlanMethod<{ adequacyPct: number; daysInRange: number }>(ADEQUACY, {
      prescribed,
      consumedDaily: [planned],
      acceptableRangePct: rangePct,
    });
    if (!result.ok) return err(result.error);
    adequacyRuns.push(result.method);
    return ok({ pct: result.outputs.adequacyPct, inRange: result.outputs.daysInRange === 1 });
  };
  const block = (
    prescribed: PlanTargets,
    planned: MacroTotals,
  ): Result<ExchangeAdequacy, DomainError> => {
    const kcal = adequacy(prescribed.kcal, planned.kcal);
    if (!kcal.ok) return kcal;
    const cho = adequacy(prescribed.choG, planned.choG);
    if (!cho.ok) return cho;
    const protein = adequacy(prescribed.proteinG, planned.proteinG);
    if (!protein.ok) return protein;
    const fat = adequacy(prescribed.fatG, planned.fatG);
    if (!fat.ok) return fat;
    return ok({
      rangePct,
      kcal: kcal.value,
      cho: cho.value,
      protein: protein.value,
      fat: fat.value,
    });
  };
  const planAdequacy = block(targets, totals);
  if (!planAdequacy.ok) return planAdequacy;

  const profiles: ExchangeProfileCalculation[] = [];
  for (const profile of plan.value.profiles) {
    const prescribed = profileTargets.find((t) => t.code === profile.code);
    if (!prescribed) throw new Error(`El perfil ${profile.code} sin sus metas.`);
    const starch = profile.starchByMeal.reduce((total, servings) => total + servings, 0);
    const profileTotals = totalsWith((code, servings) => (code === 'STA' ? starch : servings));
    const profileAdequacy = block(prescribed, profileTotals);
    if (!profileAdequacy.ok) return profileAdequacy;
    profiles.push({ ...profile, totals: profileTotals, adequacy: profileAdequacy.value });
  }

  return ok({
    plan: plan.value,
    totals,
    adequacy: planAdequacy.value,
    profiles,
    methods: [exchanges.method, ...splits, ...starchRuns, ...adequacyRuns],
  });
}

/** ¿Trae la lista los seis grupos del método clásico? (RN-E11) */
export function classicGroups(groups: readonly { readonly code: string }[]): boolean {
  return EXCHANGE_GROUP_CODES.every((code) => groups.some((g) => g.code === code));
}
