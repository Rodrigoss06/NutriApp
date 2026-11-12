-- P14.5 · Los coeficientes de la fatiga por grupo muscular de la hoja piloto de JV Fitness (P-27, respuesta de Jeremy del
-- 2026-11-10; P-27.1 y P-27.2, respuestas de Rodrigo del 2026-11-12; RN-G16; ADR-121). Solo informan: el estado y la recuperación
-- estimada no cambian.

-- Los coeficientes de cada familia de ejercicio, versionados con los demás umbrales del panel: la fila global los recibe por el
-- valor por defecto. Una lista de {family, muscularFatigue, neuralFatigue, axialLoad, technicalDemand}: compuestos de pierna y
-- cadera, compuestos libres de torso, compuestos guiados y poleas, aislamiento y brazos, y movilidad y cardio.
ALTER TABLE training.fatigue_panel_threshold
  ADD COLUMN family_coefficients jsonb NOT NULL DEFAULT '[
    {"family":"LEG_HIP","muscularFatigue":1.2,"neuralFatigue":1.3,"axialLoad":1.3,"technicalDemand":1.2},
    {"family":"FREE_TORSO","muscularFatigue":1.1,"neuralFatigue":1.1,"axialLoad":1.0,"technicalDemand":1.1},
    {"family":"GUIDED","muscularFatigue":1.0,"neuralFatigue":1.0,"axialLoad":0.8,"technicalDemand":0.9},
    {"family":"ISOLATION","muscularFatigue":0.9,"neuralFatigue":0.7,"axialLoad":0.5,"technicalDemand":0.8},
    {"family":"MOBILITY_CARDIO","muscularFatigue":0,"neuralFatigue":0,"axialLoad":0,"technicalDemand":0}
  ]'::jsonb
    CHECK (jsonb_typeof(family_coefficients) = 'array');

-- El volumen ajustado de cada grupo en su semana, repartido por la familia de sus ejercicios ({"FREE_TORSO": 1782.0, ...}), con
-- el principal al 100 % y el secundario al 50 %: pesa los coeficientes. La familia sale del patrón, el equipo y la modalidad del
-- ejercicio (P-27.2). Sin series del grupo, null. Las filas que ya existen se llenan con `analytics:rebuild`.
ALTER TABLE analytics.patient_weekly_muscle_volume
  ADD COLUMN family_adjusted_volume_kg jsonb
    CHECK (family_adjusted_volume_kg IS NULL OR jsonb_typeof(family_adjusted_volume_kg) = 'object');
