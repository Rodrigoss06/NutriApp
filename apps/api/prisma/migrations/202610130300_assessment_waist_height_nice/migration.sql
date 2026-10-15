-- P7 · Cintura/talla con fuente (RN-D10, ADR-048).
-- NICE, guía de obesidad (recomendaciones de 2022): de 0.4 a 0.49 sin riesgo aumentado, de 0.5 a 0.59 riesgo
-- aumentado y 0.6 o más riesgo mayor. Ashwell y Gibson (BMJ Open, 2016) sostienen el umbral de 0.5. Por debajo de 0.4
-- NICE no clasifica: ahí no hay interpretación. ⚠️ NICE usa esta clasificación en adultos con IMC menor que 35; la
-- tabla no expresa esa condición.
-- Reemplaza las dos filas provisionales de 202610130100 («umbral habitual 0.5»), que nunca llegaron a staging. Misma
-- versión (valid_from) que el resto de la carga inicial. Desde los 18 años, como todos los rangos: en menores, el valor
-- se muestra con su método y el aviso «Sin interpretación pediátrica en la versión 1.0» (RN-D05).
DELETE FROM assessment.reference_range
WHERE id IN ('01926100-0000-7000-8000-000000000015', '01926100-0000-7000-8000-000000000016');

INSERT INTO assessment.reference_range
  (id, organization_id, metric_code, sex, min_age, max_age, population, min_value, max_value, label, severity, source,
   valid_from)
VALUES
  ('01926100-0000-7000-8000-000000000027', NULL, 'WAIST_HEIGHT_RATIO', NULL, 18, NULL, NULL, 0.4, 0.5, 'Sin riesgo aumentado', 'NEUTRAL', 'NICE, guía de obesidad (recomendaciones de 2022); Ashwell y Gibson (BMJ Open, 2016)', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000028', NULL, 'WAIST_HEIGHT_RATIO', NULL, 18, NULL, NULL, 0.5, 0.6, 'Riesgo aumentado', 'CAUTION', 'NICE, guía de obesidad (recomendaciones de 2022); Ashwell y Gibson (BMJ Open, 2016)', DATE '2026-10-13'),
  ('01926100-0000-7000-8000-000000000029', NULL, 'WAIST_HEIGHT_RATIO', NULL, 18, NULL, NULL, 0.6, NULL, 'Riesgo mayor', 'RISK', 'NICE, guía de obesidad (recomendaciones de 2022)', DATE '2026-10-13');
