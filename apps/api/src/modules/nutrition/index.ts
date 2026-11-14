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
/** La migración de cuentas (RF-40, ADR-135): el plan del sistema anterior, al historial, en su transacción. */
export {
  ImportedPlanCommands,
  type ImportedPlanInput,
} from './application/commands/imported-plan.commands.js';
export { NutritionModule } from './nutrition.module.js';
