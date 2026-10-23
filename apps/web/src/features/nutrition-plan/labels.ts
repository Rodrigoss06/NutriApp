import type { MealSlot, PlanStatus } from '@nutricoach/contracts';
import type { Tone } from '@nutricoach/ui';

export const PLAN_STATUS_LABELS: Readonly<Record<PlanStatus, string>> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Vigente',
  SUPERSEDED: 'Reemplazado',
  ARCHIVED: 'Archivado',
};

export const PLAN_STATUS_TONES: Readonly<Record<PlanStatus, Tone>> = {
  DRAFT: 'info',
  PUBLISHED: 'success',
  SUPERSEDED: 'warning',
  ARCHIVED: 'warning',
};

export const MEAL_SLOT_LABELS: Readonly<Record<MealSlot, string>> = {
  BREAKFAST: 'Desayuno',
  MID_MORNING: 'Media mañana',
  LUNCH: 'Almuerzo',
  AFTERNOON: 'Media tarde',
  DINNER: 'Cena',
  CUSTOM: 'Otro',
};
