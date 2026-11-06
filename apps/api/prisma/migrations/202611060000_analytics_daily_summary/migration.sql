-- P14 (PR 2a) · El resumen diario de la analítica (RF-32, RN-I03; ADR-086).

ALTER TABLE analytics.patient_daily_summary
  -- Adherencia por tiempo de comida (RF-32): por código del tiempo, si el plan vigente ese día lo tenía y cuántos registros
  -- tuvo. {"BREAKFAST": {"planned": true, "logged": 2}, "SNACK": {"planned": false, "logged": 1}}
  ADD COLUMN meal_slots jsonb NOT NULL DEFAULT '{}',
  -- Un alimento sin un nutriente no es cero (RN-I03): kcal y macronutrientes guardan la suma de lo conocido y aquí, en cuántos
  -- registros del día falta cada uno, con el total de registros. {"items": 4, "kcal": 0, "cho_g": 1, "protein_g": 1, ...}
  ADD COLUMN nutrients_missing jsonb NOT NULL DEFAULT '{}';
