-- P14.5 (PR 1e) · Los cambios del día: «no entreno hoy», «mover a mañana» y el perfil que el coach elige por fecha (07 §2 y §8;
-- P-20.3 y P-20.4; RN-G03; ADR-104). Nunca se aplican solos: manda el programa hasta que el paciente o el coach cambian el día,
-- y solo hoy (el coach, también mañana).
CREATE TABLE tracking.day_change (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL,
  patient_id       uuid NOT NULL,
  local_date       date NOT NULL,          -- el día que cambia; en MOVED, el día del que sale la sesión hacia el siguiente
  kind             text NOT NULL CHECK (kind IN ('NOT_TRAINING','MOVED','PROFILE')),
  day_profile_code text CHECK (day_profile_code ~ '^[A-Z][A-Z0-9_]{0,19}$'),
  created_by       uuid NOT NULL,          -- el usuario que cambió el día: el paciente o un miembro de su equipo
  created_by_role  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  voided_by        uuid,
  voided_at        timestamptz,
  CHECK ((kind = 'PROFILE') = (day_profile_code IS NOT NULL)),
  CHECK ((voided_at IS NULL) = (voided_by IS NULL))
);
-- Un cambio vigente de cada tipo por día. Deshacer lo anula, nunca lo borra.
CREATE UNIQUE INDEX day_change_one_active ON tracking.day_change (patient_id, local_date, kind) WHERE voided_at IS NULL;
-- El trabajo de cada hora lee los de la organización desde ayer.
CREATE INDEX day_change_by_date ON tracking.day_change (organization_id, local_date) WHERE voided_at IS NULL;

SELECT app.enable_tenant_rls('tracking.day_change');
SELECT app.restrict_platform_admin('tracking.day_change');
SELECT app.enable_care_team_scope('tracking.day_change');
SELECT app.restrict_patient('tracking.day_change', 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');
-- Como el resto de lo del paciente (202610090003_account_scope): ACCOUNT no ve ni cambia su día.
SELECT app.restrict_account('tracking.day_change');
REVOKE UPDATE ON tracking.day_change FROM app_user;
GRANT UPDATE (voided_by, voided_at) ON tracking.day_change TO app_user;
