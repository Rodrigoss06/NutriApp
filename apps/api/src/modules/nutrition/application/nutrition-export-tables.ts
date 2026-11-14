import type { PatientExportTable } from '../../clinical/index.js';

const OF_PLANS = 'plan_id IN (SELECT id FROM nutrition.plan WHERE patient_id = $1)';
const OF_MEALS =
  'plan_meal_id IN (SELECT m.id FROM nutrition.plan_meal m JOIN nutrition.plan p ON p.id = m.plan_id WHERE p.patient_id = $1)';

/**
 * Lo de nutrition en la exportación del paciente (RN-B04, ADR-131): sus prescripciones energéticas, los alimentos excluidos por sus
 * condiciones y sus planes, con su snapshot y todas sus partes, también los borradores y las versiones anteriores.
 */
export const NUTRITION_EXPORT_TABLES: readonly PatientExportTable[] = [
  { table: 'nutrition.energy_prescription' },
  { table: 'nutrition.food_exclusion', orderBy: 'condition_id, food_id' },
  { table: 'nutrition.plan' },
  { table: 'nutrition.plan_day_profile', where: OF_PLANS, orderBy: 'plan_id, code' },
  { table: 'nutrition.plan_exchange', where: OF_PLANS, orderBy: 'plan_id, group_code' },
  { table: 'nutrition.plan_meal', where: OF_PLANS },
  { table: 'nutrition.plan_meal_exchange', where: OF_MEALS, orderBy: 'plan_meal_id, group_code' },
  {
    table: 'nutrition.plan_meal_profile_exchange',
    where: OF_MEALS,
    orderBy: 'plan_meal_id, profile_code, group_code',
  },
  {
    table: 'nutrition.plan_meal_allowed_food',
    where: OF_MEALS,
    orderBy: 'plan_meal_id, group_code, food_id',
  },
  { table: 'nutrition.plan_item', where: OF_MEALS },
  { table: 'nutrition.plan_item_profile', where: OF_PLANS, orderBy: 'plan_item_id, profile_code' },
];
