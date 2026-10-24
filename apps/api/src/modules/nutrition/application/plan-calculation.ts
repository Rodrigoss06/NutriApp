import {
  ADEQUACY,
  EXCHANGES_CLASSIC,
  kcalOfMacros,
  MEAL_SPLIT_LARGEST_REMAINDER,
  runMethod,
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

export interface PlanCalculation {
  readonly plan: ExchangePlan;
  readonly totals: {
    readonly kcal: number;
    readonly choG: number;
    readonly proteinG: number;
    readonly fatG: number;
  };
  readonly adequacy: {
    readonly rangePct: readonly [number, number];
    readonly kcal: Adequacy;
    readonly cho: Adequacy;
    readonly protein: Adequacy;
    readonly fat: Adequacy;
  };
  readonly methods: readonly PlanMethodRun[];
}

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
 * organización (RN-E10). Los ajustes a mano y las reglas del plan los decide el dominio.
 */
export function calculatePlan(
  input: PlanDraftInput,
  targets: PlanTargets,
  list: PlanList,
  rangePct: readonly [number, number],
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
  const plan = exchangePlan(input, { automaticServings: exchanges.outputs.servings, split }, names);
  if (!plan.ok) return plan;

  const byCode = new Map(list.groups.map((g) => [g.code, g]));
  const sum = (macro: 'choG' | 'proteinG' | 'fatG'): number =>
    plan.value.exchanges.reduce(
      (total, e) => total + e.servings * (byCode.get(e.groupCode)?.[macro] ?? 0),
      0,
    );
  const macros = { choG: sum('choG'), proteinG: sum('proteinG'), fatG: sum('fatG') };
  const totals = { ...macros, kcal: kcalOfMacros(macros) };

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
  const kcal = adequacy(targets.kcal, totals.kcal);
  if (!kcal.ok) return kcal;
  const cho = adequacy(targets.choG, totals.choG);
  if (!cho.ok) return cho;
  const protein = adequacy(targets.proteinG, totals.proteinG);
  if (!protein.ok) return protein;
  const fat = adequacy(targets.fatG, totals.fatG);
  if (!fat.ok) return fat;

  return ok({
    plan: plan.value,
    totals,
    adequacy: {
      rangePct,
      kcal: kcal.value,
      cho: cho.value,
      protein: protein.value,
      fat: fat.value,
    },
    methods: [exchanges.method, ...splits, ...adequacyRuns],
  });
}

/** ¿Trae la lista los seis grupos del método clásico? (RN-E11) */
export function classicGroups(groups: readonly { readonly code: string }[]): boolean {
  return EXCHANGE_GROUP_CODES.every((code) => groups.some((g) => g.code === code));
}
