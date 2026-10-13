-- P7 · Rangos de referencia como datos (RN-D10, ADR-014) y permisos de resultados y preferencias (ADR-046).

-- Rangos ------------------------------------------------------------------------------------------------------------
-- Globales (organization_id NULL), de la guía de dominio §2.5 y §3.8. Intervalos semiabiertos [min_value, max_value):
-- la tabla ACE tiene huecos entre bandas (ADR-044). severity guarda el tono: NEUTRAL, CAUTION o RISK. La interpretación
-- usa el valor sin redondear (RN-D09). ⚠️ Desde los 18 años: para menores, sin interpretación hasta tener tablas por
-- edad. ⚠️ La cintura/talla no tiene fuente en la guía («umbral habitual 0.5»): confirmarla. Fija desde su carga: un
-- cambio va en una migración nueva.
INSERT INTO assessment.reference_range
  (id, organization_id, metric_code, sex, min_age, max_age, population, min_value, max_value, label, severity, source,
   valid_from)
VALUES
  ('01926100-0000-7000-8000-000000000001', NULL, 'BMI', NULL, 18, NULL, NULL, NULL, 18.5, 'Bajo peso', 'CAUTION', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000002', NULL, 'BMI', NULL, 18, NULL, NULL, 18.5, 25, 'Normal', 'NEUTRAL', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000003', NULL, 'BMI', NULL, 18, NULL, NULL, 25, 30, 'Sobrepeso', 'CAUTION', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000004', NULL, 'BMI', NULL, 18, NULL, NULL, 30, NULL, 'Obesidad', 'RISK', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000005', NULL, 'GIRTH_WAIST', 'M', 18, NULL, NULL, NULL, 94, 'Sin riesgo aumentado', 'NEUTRAL', 'OMS 2008', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000006', NULL, 'GIRTH_WAIST', 'M', 18, NULL, NULL, 94, 102, 'Riesgo aumentado', 'CAUTION', 'OMS 2008', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000007', NULL, 'GIRTH_WAIST', 'M', 18, NULL, NULL, 102, NULL, 'Riesgo alto', 'RISK', 'OMS 2008', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000008', NULL, 'GIRTH_WAIST', 'F', 18, NULL, NULL, NULL, 80, 'Sin riesgo aumentado', 'NEUTRAL', 'OMS 2008', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000009', NULL, 'GIRTH_WAIST', 'F', 18, NULL, NULL, 80, 88, 'Riesgo aumentado', 'CAUTION', 'OMS 2008', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000010', NULL, 'GIRTH_WAIST', 'F', 18, NULL, NULL, 88, NULL, 'Riesgo alto', 'RISK', 'OMS 2008', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000011', NULL, 'WAIST_HIP_RATIO', 'M', 18, NULL, NULL, NULL, 0.9, 'Sin obesidad abdominal', 'NEUTRAL', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000012', NULL, 'WAIST_HIP_RATIO', 'M', 18, NULL, NULL, 0.9, NULL, 'Obesidad abdominal', 'RISK', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000013', NULL, 'WAIST_HIP_RATIO', 'F', 18, NULL, NULL, NULL, 0.85, 'Sin obesidad abdominal', 'NEUTRAL', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000014', NULL, 'WAIST_HIP_RATIO', 'F', 18, NULL, NULL, 0.85, NULL, 'Obesidad abdominal', 'RISK', 'OMS', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000015', NULL, 'WAIST_HEIGHT_RATIO', NULL, 18, NULL, NULL, NULL, 0.5, 'Sin riesgo aumentado', 'NEUTRAL', 'Umbral habitual 0.5 (guía de dominio)', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000016', NULL, 'WAIST_HEIGHT_RATIO', NULL, 18, NULL, NULL, 0.5, NULL, 'Riesgo aumentado', 'CAUTION', 'Umbral habitual 0.5 (guía de dominio)', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000017', NULL, 'FAT_PCT', 'M', 18, NULL, NULL, 2, 6, 'Grasa esencial', 'CAUTION', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000018', NULL, 'FAT_PCT', 'M', 18, NULL, NULL, 6, 14, 'Atlético', 'NEUTRAL', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000019', NULL, 'FAT_PCT', 'M', 18, NULL, NULL, 14, 18, 'Fitness', 'NEUTRAL', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000020', NULL, 'FAT_PCT', 'M', 18, NULL, NULL, 18, 25, 'Promedio', 'NEUTRAL', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000021', NULL, 'FAT_PCT', 'M', 18, NULL, NULL, 25, NULL, 'Obesidad', 'RISK', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000022', NULL, 'FAT_PCT', 'F', 18, NULL, NULL, 10, 14, 'Grasa esencial', 'CAUTION', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000023', NULL, 'FAT_PCT', 'F', 18, NULL, NULL, 14, 21, 'Atlético', 'NEUTRAL', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000024', NULL, 'FAT_PCT', 'F', 18, NULL, NULL, 21, 25, 'Fitness', 'NEUTRAL', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000025', NULL, 'FAT_PCT', 'F', 18, NULL, NULL, 25, 32, 'Promedio', 'NEUTRAL', 'ACE', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000026', NULL, 'FAT_PCT', 'F', 18, NULL, NULL, 32, NULL, 'Obesidad', 'RISK', 'ACE', DATE '2026-10-13');

-- Resultados (RN-D01, RN-D08) ---------------------------------------------------------------------------------------
-- Un indicador es parte de un resultado inmutable: no se edita.
REVOKE UPDATE ON assessment.result_metric FROM app_user;

-- Preferencias de métodos (RN-D05) ----------------------------------------------------------------------------------
-- Quitar una preferencia devuelve el método del nivel de arriba (organización o plataforma).
GRANT DELETE ON assessment.method_preference TO app_user;
