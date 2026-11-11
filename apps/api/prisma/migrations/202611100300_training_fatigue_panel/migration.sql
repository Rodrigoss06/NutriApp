-- P14.5 (PR 3) · El panel de fatiga y recuperación de la hoja piloto de JV Fitness (P-23 y P-24, respuestas de Jeremy del
-- 2026-11-09; RN-G16; ADR-108). Solo informa: decide el control semanal (P-25).

-- Los umbrales del panel, versionados como los de 07 §11: una fila global con los valores de Jeremy y, si la organización los
-- cambia, las suyas. Las 3 semanas de la base son del método (FATIGUE_PANEL_JV), no de esta tabla.
CREATE TABLE training.fatigue_panel_threshold (
  id                               uuid PRIMARY KEY,
  organization_id                  uuid,
  valid_from                       date NOT NULL,
  recovery_red_stress_min          numeric(3,1) NOT NULL DEFAULT 4,
  recovery_red_sleep_below_hours   numeric(3,1) NOT NULL DEFAULT 6,
  recovery_amber_stress_min        numeric(3,1) NOT NULL DEFAULT 3,
  recovery_amber_sleep_below_hours numeric(3,1) NOT NULL DEFAULT 7,
  fatigue_red_min                  numeric(3,1) NOT NULL DEFAULT 4,
  fatigue_amber_min                numeric(3,1) NOT NULL DEFAULT 3,
  load_amber_above_pct             numeric(5,1) NOT NULL DEFAULT 15,
  load_red_above_pct               numeric(5,1) NOT NULL DEFAULT 30,
  CHECK (recovery_amber_stress_min <= recovery_red_stress_min),
  CHECK (recovery_red_sleep_below_hours <= recovery_amber_sleep_below_hours),
  CHECK (fatigue_amber_min <= fatigue_red_min),
  CHECK (load_amber_above_pct <= load_red_above_pct),
  UNIQUE NULLS NOT DISTINCT (organization_id, valid_from)
);
SELECT app.enable_catalog_rls('training.fatigue_panel_threshold');
SELECT app.restrict_patient('training.fatigue_panel_threshold');

-- P-23: recuperación roja con estrés 4 o sueño de menos de 6 h, ámbar con estrés 3 o sueño de 6.0 a menos de 7.0 h; fatiga
-- percibida ámbar 3 y roja 4; carga ámbar sobre +15 % y roja sobre +30 %. Vale desde antes de los datos de la hoja piloto.
INSERT INTO training.fatigue_panel_threshold (id, organization_id, valid_from)
VALUES ('019a2000-0000-7000-8000-000000000003', NULL, '2026-01-01');

-- La fatiga del registro diario, de 1 a 5, con el ajuste del profesional aplicado (RN-G02): el panel la promedia por semana.
-- Las filas que ya existen se llenan con `analytics:rebuild`.
ALTER TABLE analytics.patient_daily_summary
  ADD COLUMN fatigue smallint CHECK (fatigue BETWEEN 1 AND 5);
