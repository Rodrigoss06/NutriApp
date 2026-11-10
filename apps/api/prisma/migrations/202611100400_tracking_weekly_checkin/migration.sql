-- P14.5 (PR 5a) · El check-in de la semana (P-21 y P-22, respuestas de Jeremy del 2026-11-09; decisiones de Rodrigo del
-- 2026-11-10; RN-G11; ADR-109): el domingo, el paciente declara su alimentación de la semana, de 0 a 100 %, y puede sumar su peso y
-- un comentario. Se completa del domingo al martes siguiente. El control semanal toma esa alimentación (P-22).
CREATE TABLE tracking.weekly_checkin (
  id                       uuid PRIMARY KEY,
  organization_id          uuid NOT NULL,
  patient_id               uuid NOT NULL,
  week_date                date NOT NULL CHECK (extract(isodow FROM week_date) = 7),  -- el domingo de la semana
  client_id                uuid NOT NULL,
  logged_on                date NOT NULL,          -- el día en que lo envió, en su fecha local: el del peso y la nota
  nutrition_compliance_pct smallint NOT NULL CHECK (nutrition_compliance_pct BETWEEN 0 AND 100),
  metric_log_id            uuid,                   -- el peso, en tracking.metric_log (particionada: sin FK, ADR-024)
  note_id                  uuid,                   -- el comentario, como nota del paciente sin leer (RN-G13)
  status                   text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  voided_at                timestamptz,
  CHECK ((status = 'VOIDED') = (voided_at IS NOT NULL)),
  CHECK (logged_on BETWEEN week_date AND week_date + 2),
  UNIQUE (patient_id, week_date, client_id)
);
-- Uno vigente por semana: enviarlo otra vez dentro del plazo lo corrige y anula el anterior, nunca lo borra (RN-G12).
CREATE UNIQUE INDEX weekly_checkin_one_active ON tracking.weekly_checkin (patient_id, week_date) WHERE status = 'ACTIVE';
CREATE INDEX weekly_checkin_by_week ON tracking.weekly_checkin (organization_id, week_date) WHERE status = 'ACTIVE';

SELECT app.enable_tenant_rls('tracking.weekly_checkin');
SELECT app.restrict_platform_admin('tracking.weekly_checkin');
SELECT app.enable_care_team_scope('tracking.weekly_checkin');
SELECT app.restrict_patient('tracking.weekly_checkin', 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');
SELECT app.restrict_account('tracking.weekly_checkin');
REVOKE UPDATE ON tracking.weekly_checkin FROM app_user;
GRANT UPDATE (status, voided_at) ON tracking.weekly_checkin TO app_user;
