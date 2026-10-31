-- P12 · ADR-071 (05 §3): el paciente solo escribe sus registros y su consentimiento. patient_scope deja leer con USING y
-- le prohíbe escribir con WITH CHECK, pero DELETE solo evalúa USING: donde el paciente puede leer y app_user tiene DELETE,
-- podía borrar. Ninguna ruta del paciente lo hace; esta es la segunda barrera. La prueba del catálogo revisa que no aparezca
-- otra tabla así.

CREATE POLICY patient_no_delete ON exercise.exercise_muscle AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');
CREATE POLICY patient_no_delete ON food.household_measure AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');
CREATE POLICY patient_no_delete ON food.recipe_ingredient AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');
CREATE POLICY patient_no_delete ON analytics.patient_daily_summary AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');
CREATE POLICY patient_no_delete ON analytics.patient_weekly_muscle_volume AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');
CREATE POLICY patient_no_delete ON analytics.exercise_one_rm_series AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');
