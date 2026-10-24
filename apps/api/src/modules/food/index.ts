// API pública de food (02 §2). Otros contextos solo importan esto.
export { FoodApi } from './application/food-api.js';
export type {
  ExchangeGroupRecord,
  ExchangeListRecord,
  FoodRecord,
  FoodSummaryRecord,
} from './application/ports/food.port.js';
export type { PlateComposition, PlateItemInput } from './application/plate-composition.js';
export type { RecipeRecord } from './application/ports/recipe.port.js';
export { FoodModule } from './food.module.js';
