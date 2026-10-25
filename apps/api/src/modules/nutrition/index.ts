// API pública de nutrition (02 §2). Otros contextos solo importan esto.
export {
  NutritionApi,
  type EnergySummary,
  type PublishedPlan,
} from './application/nutrition-api.js';
export type {
  CompositionPlanDocument,
  ExchangePlanDocument,
  PlanSnapshot,
  WeeklyMenuPlanDocument,
} from './application/plan-document.js';
export { NutritionModule } from './nutrition.module.js';
