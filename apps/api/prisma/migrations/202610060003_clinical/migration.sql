-- 0003 · clinical (Notion 05.1).

CREATE TABLE clinical.patient (
  id                    uuid PRIMARY KEY,
  organization_id       uuid NOT NULL,
  user_id               uuid,                         -- cuenta de la app; NULL hasta aceptar la invitación
  code                  text NOT NULL,                -- correlativo legible por organización: P-000123
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  sex                   char(1) NOT NULL CHECK (sex IN ('M','F')),  -- sexo biológico para las ecuaciones
  gender_identity       text,                         -- opcional, solo para el trato
  birth_date            date NOT NULL,
  document_type         text CHECK (document_type IN ('DNI','CE','PASAPORTE','OTRO')),
  document_number_enc   bytea,                        -- AES-256-GCM con versión de llave
  document_number_bidx  bytea,                        -- HMAC-SHA256 para búsqueda exacta
  email                 citext,
  phone_enc             bytea,
  timezone              text NOT NULL DEFAULT 'America/Lima',
  population            text NOT NULL DEFAULT 'ADULT' CHECK (population IN ('ADULT','ATHLETE','CHILD','ADOLESCENT','OBESITY','OLDER_ADULT')),
  status                text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED','ANONYMIZED')),
  responsible_member_id uuid NOT NULL,
  tags                  text[] NOT NULL DEFAULT '{}',
  archived_at           timestamptz,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               int NOT NULL DEFAULT 0,
  UNIQUE (organization_id, code)
);
CREATE UNIQUE INDEX patient_document ON clinical.patient (organization_id, document_number_bidx)
  WHERE document_number_bidx IS NOT NULL;
CREATE INDEX patient_list ON clinical.patient (organization_id, status, last_name);
CREATE INDEX patient_name_trgm ON clinical.patient
  USING gin (app.unaccent_immutable(lower(first_name || ' ' || last_name)) gin_trgm_ops);

CREATE TABLE clinical.care_team_member (
  patient_id      uuid NOT NULL REFERENCES clinical.patient(id),
  member_id       uuid NOT NULL,
  organization_id uuid NOT NULL,
  role            text NOT NULL CHECK (role IN ('RESPONSIBLE','NUTRITION','TRAINING','COLLABORATOR')),
  access          text NOT NULL DEFAULT 'WRITE' CHECK (access IN ('READ','WRITE')),
  added_by        uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, member_id)
);
CREATE INDEX care_team_by_member ON clinical.care_team_member (organization_id, member_id);

CREATE TABLE clinical.consent_document (             -- textos legales versionados, revisados por el abogado del cliente
  id              uuid PRIMARY KEY,
  organization_id uuid,                              -- NULL = texto de la plataforma
  purpose         text NOT NULL,
  version         text NOT NULL,
  body_markdown   text NOT NULL,
  sha256          bytea NOT NULL,
  published_at    timestamptz,
  UNIQUE NULLS NOT DISTINCT (organization_id, purpose, version)
);

CREATE TABLE clinical.consent (
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  patient_id          uuid NOT NULL REFERENCES clinical.patient(id),
  purpose             text NOT NULL CHECK (purpose IN ('HEALTH_DATA','APP_ACCESS','IMAGES','ANONYMIZED_RESEARCH','MARKETING')),
  consent_document_id uuid NOT NULL REFERENCES clinical.consent_document(id),
  granted_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  channel             text NOT NULL CHECK (channel IN ('APP','IN_PERSON_DIGITAL','PAPER_SCANNED')),
  evidence_file_id    uuid,
  granted_by_user_id  uuid,
  ip                  inet,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX consent_active ON clinical.consent (patient_id, purpose) WHERE revoked_at IS NULL;

CREATE TABLE clinical.clinical_history (             -- anamnesis: cada guardado es una revisión
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL REFERENCES clinical.patient(id),
  revision        int NOT NULL,
  form_code       text NOT NULL,
  form_version    text NOT NULL,                     -- el esquema Zod que valida answers
  answers         jsonb NOT NULL,
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, revision)
);

CREATE TABLE clinical.condition (                    -- consultable: alergias, enfermedades, fármacos, lesiones
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL REFERENCES clinical.patient(id),
  kind            text NOT NULL CHECK (kind IN ('DISEASE','ALLERGY','INTOLERANCE','MEDICATION','SUPPLEMENT','SURGERY','INJURY','OTHER')),
  code_system     text,                              -- p. ej. CIE-10
  code            text,
  label           text NOT NULL,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESOLVED')),
  since           date,
  notes           text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinical.goal (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL REFERENCES clinical.patient(id),
  kind            text NOT NULL CHECK (kind IN ('FAT_LOSS','MUSCLE_GAIN','MAINTENANCE','RECOMPOSITION','PERFORMANCE','HEALTH','OTHER')),
  metric_code     text,
  target_value    numeric(10,3),
  target_date     date,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ACHIEVED','ABANDONED')),
  notes           text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinical.clinical_note (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL,
  patient_id       uuid NOT NULL REFERENCES clinical.patient(id),
  author_member_id uuid NOT NULL,
  body             text NOT NULL,
  visibility       text NOT NULL DEFAULT 'CARE_TEAM' CHECK (visibility IN ('CARE_TEAM','AUTHOR_ONLY')),
  amends_note_id   uuid REFERENCES clinical.clinical_note(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS ----------------------------------------------------------------------------------------------
SELECT app.enable_tenant_rls('clinical.patient');
SELECT app.enable_tenant_rls('clinical.care_team_member');
SELECT app.enable_catalog_rls('clinical.consent_document');
SELECT app.enable_tenant_rls('clinical.consent');
SELECT app.enable_tenant_rls('clinical.clinical_history');
SELECT app.enable_tenant_rls('clinical.condition');
SELECT app.enable_tenant_rls('clinical.goal');
SELECT app.enable_tenant_rls('clinical.clinical_note');

-- El paciente ve su ficha, sus consentimientos (los otorga y revoca desde la app) y los textos legales.
-- No ve historia, condiciones, objetivos ni notas: su acceso legal es la exportación (RN-B04).
SELECT app.restrict_patient('clinical.patient', 'id = app.patient_id()');
SELECT app.restrict_patient('clinical.consent', 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('clinical.consent_document', 'true');
SELECT app.restrict_patient('clinical.care_team_member');
SELECT app.restrict_patient('clinical.clinical_history');
SELECT app.restrict_patient('clinical.condition');
SELECT app.restrict_patient('clinical.goal');
SELECT app.restrict_patient('clinical.clinical_note');

-- Soporte de la plataforma: solo lectura y con permiso clínico vigente (RN-A09). Los textos legales no
-- son datos clínicos.
SELECT app.restrict_platform_admin('clinical.patient');
SELECT app.restrict_platform_admin('clinical.care_team_member');
SELECT app.restrict_platform_admin('clinical.consent');
SELECT app.restrict_platform_admin('clinical.clinical_history');
SELECT app.restrict_platform_admin('clinical.condition');
SELECT app.restrict_platform_admin('clinical.goal');
SELECT app.restrict_platform_admin('clinical.clinical_note');

-- Permisos -----------------------------------------------------------------------------------------
-- Un consentimiento solo se revoca. Cada revisión de la historia es nueva: nunca se actualiza.
REVOKE UPDATE ON clinical.consent FROM app_user;
GRANT UPDATE (revoked_at) ON clinical.consent TO app_user;
REVOKE UPDATE ON clinical.clinical_history FROM app_user;
-- Quitar a alguien del equipo de atención.
GRANT DELETE ON clinical.care_team_member TO app_user;
