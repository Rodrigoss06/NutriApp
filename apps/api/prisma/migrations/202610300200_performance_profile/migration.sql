-- P12 · Anamnesis V2 y perfil de rendimiento (RF-43, RN-F16; 07 §12, ADR-072). La anamnesis se guarda en
-- clinical.clinical_history con form_code 'JV_ANAMNESIS' y form_version 'V2'; cada revisión deja aquí su perfil.

CREATE TABLE clinical.performance_profile (           -- PRI de la anamnesis; inmutable (RN-D08)
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  patient_id          uuid NOT NULL REFERENCES clinical.patient(id),
  clinical_history_id uuid NOT NULL REFERENCES clinical.clinical_history(id),
  method_code         text NOT NULL,                  -- 'PRI_JV'
  method_version      text NOT NULL,                  -- semver del registro del motor
  engine_version      text NOT NULL,
  inputs              jsonb NOT NULL,                 -- solo las respuestas que puntúan
  inputs_hash         bytea NOT NULL,
  domain_scores       jsonb NOT NULL,                 -- 0 a 100 por dominio; null si el dominio no tiene respuestas (P-10)
  pri                 numeric(7,4),                   -- 4 decimales, como result_metric: se redondea al presentar (RN-D09)
  classes             jsonb NOT NULL,                 -- recuperación, disponibilidad, experiencia, adherencia, tolerancia al
                                                      -- volumen, supervisión, frecuencia de check-in y prioridad principal
  computed_at         timestamptz NOT NULL,
  UNIQUE (clinical_history_id, method_code, method_version, inputs_hash)
);

-- RLS: el paciente no ve su perfil, como su historia; orienta al coach (RN-F16).
SELECT app.enable_tenant_rls('clinical.performance_profile');
SELECT app.restrict_patient('clinical.performance_profile');
SELECT app.restrict_platform_admin('clinical.performance_profile');
SELECT app.enable_care_team_scope('clinical.performance_profile');
SELECT app.restrict_account('clinical.performance_profile');

-- Un resultado no se actualiza: una anamnesis nueva deja otro perfil.
REVOKE UPDATE ON clinical.performance_profile FROM app_user;
