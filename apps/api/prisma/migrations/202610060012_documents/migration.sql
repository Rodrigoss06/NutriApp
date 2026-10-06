-- 0012 · documents (Notion 05.3).

CREATE TABLE documents.template (
  id uuid PRIMARY KEY, organization_id uuid,
  kind text NOT NULL CHECK (kind IN ('EXCHANGE_DIET','WEEKLY_MENU','ANTHROPOMETRY','EVOLUTION','TRAINING')),
  version text NOT NULL, layout jsonb NOT NULL, status text NOT NULL DEFAULT 'ACTIVE',
  UNIQUE NULLS NOT DISTINCT (organization_id, kind, version)
);
CREATE TABLE documents.generated_document (            -- RN-H02: reproducible
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, patient_id uuid NOT NULL,
  kind text NOT NULL, source_type text NOT NULL, source_id uuid NOT NULL, source_hash bytea NOT NULL,
  template_version text NOT NULL, branding_hash bytea NOT NULL,
  file_id uuid NOT NULL, sha256 bytea NOT NULL,
  generated_by uuid NOT NULL, generated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS ----------------------------------------------------------------------------------------------
SELECT app.enable_catalog_rls('documents.template');
SELECT app.enable_tenant_rls('documents.generated_document');

-- El paciente ve sus fichas generadas.
SELECT app.restrict_patient('documents.generated_document', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('documents.template');
SELECT app.restrict_platform_admin('documents.generated_document');

-- Permisos -----------------------------------------------------------------------------------------
-- Una ficha generada no cambia: regenerarla crea otra (RN-H02).
REVOKE UPDATE ON documents.generated_document FROM app_user;
