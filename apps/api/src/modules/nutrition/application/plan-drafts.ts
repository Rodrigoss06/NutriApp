import type { DomainError, OrganizationId, Result } from '@nutricoach/shared-kernel';
import { err, ok } from '@nutricoach/shared-kernel';
import {
  compositionPublishProblems,
  DEFAULT_MEAL_HEADERS,
  emptyMenuDays,
  weeklyMenuPublishProblems,
  type PlanDraft,
} from '../domain/food-plan.js';
import {
  DEFAULT_MEALS,
  publishProblems,
  type ExchangeGroupCode,
  type PlanModality,
} from '../domain/nutrition-plan.js';
import {
  compositionDocument,
  planDocument,
  weeklyMenuDocument,
  type PlanDocument,
} from './plan-document.js';
import type {
  CalculatedComposition,
  CalculatedPlan,
  CalculatedWeeklyMenu,
  PlanCalculator,
} from './plan-calculator.js';
import type { EnergyPrescriptionRecord, PlanContent } from './ports/nutrition.ports.js';

/** Un borrador calculado por el motor, de su modalidad. */
export type CalculatedDraft =
  | { readonly modality: 'EXCHANGES'; readonly value: CalculatedPlan }
  | { readonly modality: 'COMPOSITION'; readonly value: CalculatedComposition }
  | { readonly modality: 'WEEKLY_MENU'; readonly value: CalculatedWeeklyMenu };

/**
 * Cómo empieza un plan: con los tiempos de G-19 y sin alimentos ni hidratación. Por intercambios, sin grupos fijos;
 * el menú, con sus siete días vacíos.
 */
export function newDraft(modality: PlanModality): PlanDraft {
  const empty = { hydrationTargetMl: null, instructions: null };
  switch (modality) {
    case 'EXCHANGES':
      return {
        modality,
        fixedServings: { VEG: 0, FRU: 0, MILK: 0 },
        overrides: {},
        meals: DEFAULT_MEALS,
        splitOverrides: {},
        ...empty,
      };
    case 'COMPOSITION':
      return { modality, meals: DEFAULT_MEAL_HEADERS.map((h) => ({ ...h, items: [] })), ...empty };
    case 'WEEKLY_MENU':
      return {
        modality,
        meals: DEFAULT_MEAL_HEADERS,
        days: emptyMenuDays(DEFAULT_MEAL_HEADERS.length),
        ...empty,
      };
  }
}

/** Calcula un borrador de cualquier modalidad; solo los intercambios usan lista (RN-E11). */
export async function calculateDraft(
  calculator: PlanCalculator,
  organizationId: OrganizationId,
  prescription: EnergyPrescriptionRecord,
  exchangeListId: string | null,
  draft: PlanDraft,
): Promise<Result<CalculatedDraft, DomainError>> {
  switch (draft.modality) {
    case 'EXCHANGES': {
      if (!exchangeListId) throw new Error('Un plan por intercambios sin lista.');
      const value = await calculator.calculate(organizationId, prescription, exchangeListId, draft);
      return value.ok ? ok({ modality: draft.modality, value: value.value }) : err(value.error);
    }
    case 'COMPOSITION': {
      const value = await calculator.composition(organizationId, prescription, draft);
      return value.ok ? ok({ modality: draft.modality, value: value.value }) : err(value.error);
    }
    case 'WEEKLY_MENU': {
      const value = await calculator.weeklyMenu(organizationId, prescription, draft);
      return value.ok ? ok({ modality: draft.modality, value: value.value }) : err(value.error);
    }
  }
}

/** Lo que se guarda: el borrador validado por el dominio. */
export function contentOf(calculated: CalculatedDraft): PlanContent {
  switch (calculated.modality) {
    case 'EXCHANGES':
      return { modality: 'EXCHANGES', plan: calculated.value.calculation.plan };
    case 'COMPOSITION':
      return { modality: 'COMPOSITION', plan: calculated.value.calculation.plan };
    case 'WEEKLY_MENU':
      return { modality: 'WEEKLY_MENU', plan: calculated.value.calculation.plan };
  }
}

/** El plan entero como lo calcula el motor; los id de sus tiempos (o celdas) en su orden, vacíos en una vista previa. */
export function documentOf(calculated: CalculatedDraft, mealIds: readonly string[]): PlanDocument {
  switch (calculated.modality) {
    case 'EXCHANGES':
      return planDocument(calculated.value, mealIds);
    case 'COMPOSITION':
      return compositionDocument(calculated.value, mealIds);
    case 'WEEKLY_MENU':
      return weeklyMenuDocument(calculated.value, mealIds);
  }
}

/** Lo que falta para publicar (RN-E13, RN-G05), con el nombre de cada grupo en la lista del plan. */
export function problemsOf(calculated: CalculatedDraft): readonly string[] {
  switch (calculated.modality) {
    case 'EXCHANGES': {
      const names = Object.fromEntries(
        calculated.value.list.groups.map((g) => [g.code, g.name]),
      ) as Record<ExchangeGroupCode, string>;
      return publishProblems(calculated.value.calculation.plan, names);
    }
    case 'COMPOSITION':
      return compositionPublishProblems(calculated.value.calculation.plan);
    case 'WEEKLY_MENU':
      return weeklyMenuPublishProblems(calculated.value.calculation.plan);
  }
}

/** Las partes del borrador que cambiaron, para la auditoría: nombres, nunca valores (RN-B03). */
export function changedFields(before: PlanDraft, after: PlanDraft): readonly string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const headers = (draft: PlanDraft) =>
    draft.meals.map(({ slotCode, name, timeOfDay, sharePct }) => [
      slotCode,
      name,
      timeOfDay,
      sharePct,
    ]);
  const columns = [
    ...(before.hydrationTargetMl === after.hydrationTargetMl ? [] : ['hydration_target_ml']),
    ...(before.instructions === after.instructions ? [] : ['instructions']),
  ];
  const meals = same(headers(before), headers(after)) ? [] : ['plan_meal'];
  if (before.modality === 'EXCHANGES' && after.modality === 'EXCHANGES') {
    const foods = (draft: typeof before) => draft.meals.map((m) => m.allowedFoods);
    return [
      ...(same([before.fixedServings, before.overrides], [after.fixedServings, after.overrides])
        ? []
        : ['plan_exchange']),
      ...meals,
      ...(same(before.splitOverrides, after.splitOverrides) ? [] : ['plan_meal_exchange']),
      ...(same(foods(before), foods(after)) ? [] : ['plan_meal_allowed_food']),
      ...columns,
    ];
  }
  const items = (draft: PlanDraft) =>
    draft.modality === 'COMPOSITION'
      ? draft.meals.map((m) => m.items)
      : draft.modality === 'WEEKLY_MENU'
        ? draft.days
        : null;
  return [...meals, ...(same(items(before), items(after)) ? [] : ['plan_item']), ...columns];
}
