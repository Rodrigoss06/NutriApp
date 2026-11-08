-- P14.5 (PR 1a) · Metas de día de entrenamiento y de descanso (07 §2, P-20; RN-E07, RN-G03; ADR-099).

-- Las kcal del día de descanso que escribe el profesional. La meta de la prescripción es la del día de entrenamiento; la
-- proteína y la grasa no cambian y los carbohidratos van por diferencia (MACROS_REST_DAY, que el snapshot congela con su
-- método). Sin valor, el plan tiene una sola meta. Un plan publicado no cambia: el disparador plan_immutable_when_published
-- compara la fila entera (RN-E15).
ALTER TABLE nutrition.plan
  ADD COLUMN rest_day_kcal numeric(7,1),
  ADD CONSTRAINT plan_rest_day_kcal_positive CHECK (rest_day_kcal IS NULL OR rest_day_kcal > 0);

-- El tipo del día según el programa vigente (07 §8): TRAINING si tiene sesiones programadas, REST si no. Sin programa,
-- null. Lo escribe la meta de entrenamiento del día; la meta de alimentación de un día REST es la de descanso del plan.
ALTER TABLE tracking.daily_target
  ADD COLUMN day_kind text CHECK (day_kind IN ('TRAINING', 'REST'));

-- El mismo tipo en el resumen diario de la analítica (RF-32), desde la meta del día.
ALTER TABLE analytics.patient_daily_summary
  ADD COLUMN day_kind text CHECK (day_kind IN ('TRAINING', 'REST'));
