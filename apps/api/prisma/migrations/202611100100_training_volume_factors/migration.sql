-- P14.5 (PR 2) · El volumen ajustado de la hoja piloto de JV Fitness: volumen × factor RIR × factor descanso (P-26, respuestas de
-- Jeremy del 2026-11-10; RN-F03; ADR-106).

-- Las tablas de factores, versionadas como los umbrales de 07 §11: una fila global con los valores de Jeremy y, si la
-- organización los cambia, las suyas. Cada tabla es una lista de {from, factor, orMore}: el valor desde el que vale y si vale
-- también para lo que es mayor («RIR 5 o más», «180 s o más»). Un valor que la tabla no trae queda «sin factor».
CREATE TABLE training.volume_factor_table (
  id              uuid PRIMARY KEY,
  organization_id uuid,
  valid_from      date NOT NULL,
  rir_factors     jsonb NOT NULL CHECK (jsonb_typeof(rir_factors) = 'array'),
  rest_factors    jsonb NOT NULL CHECK (jsonb_typeof(rest_factors) = 'array'),
  UNIQUE NULLS NOT DISTINCT (organization_id, valid_from)
);
SELECT app.enable_catalog_rls('training.volume_factor_table');
SELECT app.restrict_patient('training.volume_factor_table');

-- P-26: RIR 0 = 1.3 a RIR 5 o más = 0.8 (1.0 + (3 − RIR) × 0.1); 45 s = 1.15 a 180 s o más = 0.95. Vale desde antes de los datos
-- de la hoja piloto (octubre de 2026).
INSERT INTO training.volume_factor_table (id, organization_id, valid_from, rir_factors, rest_factors)
VALUES (
  '019a2000-0000-7000-8000-000000000002', NULL, '2026-01-01',
  '[{"from":0,"factor":1.3,"orMore":false},{"from":1,"factor":1.2,"orMore":false},{"from":2,"factor":1.1,"orMore":false},
    {"from":3,"factor":1.0,"orMore":false},{"from":4,"factor":0.9,"orMore":false},{"from":5,"factor":0.8,"orMore":true}]',
  '[{"from":45,"factor":1.15,"orMore":false},{"from":60,"factor":1.10,"orMore":false},{"from":75,"factor":1.05,"orMore":false},
    {"from":90,"factor":1.00,"orMore":false},{"from":120,"factor":1.00,"orMore":false},{"from":180,"factor":0.95,"orMore":true}]'
);

-- El volumen ajustado del día y de cada grupo muscular en su semana (el principal al 100 % y el secundario al 50 %, como el
-- tonelaje, ADR-088), y cuántas series con carga quedaron «sin factor». Sin entrenos, null.
ALTER TABLE analytics.patient_daily_summary
  ADD COLUMN adjusted_volume_kg numeric(10,1),
  ADD COLUMN unfactored_sets    smallint CHECK (unfactored_sets >= 0);
ALTER TABLE analytics.patient_weekly_muscle_volume
  ADD COLUMN adjusted_volume_kg numeric(10,1),
  ADD COLUMN unfactored_sets    smallint CHECK (unfactored_sets >= 0);
