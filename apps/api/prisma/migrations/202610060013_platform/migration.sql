-- 0013 · platform (Notion 05.3). Lo técnico que no es negocio: outbox, idempotencia, banderas, archivos,
-- correlativos e importaciones.

CREATE TABLE platform.outbox_event (
  id              uuid PRIMARY KEY,                    -- UUIDv7: orden de emisión
  organization_id uuid,
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  event_type      text NOT NULL,                       -- 'nutrition.plan.published'
  event_version   smallint NOT NULL DEFAULT 1,
  payload         jsonb NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}',         -- requestId, actor
  occurred_at     timestamptz NOT NULL,
  published_at    timestamptz,
  attempts        smallint NOT NULL DEFAULT 0,
  last_error      text
);
CREATE INDEX outbox_pending ON platform.outbox_event (id) WHERE published_at IS NULL;

CREATE TABLE platform.processed_event (consumer text NOT NULL, event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (consumer, event_id));

CREATE TABLE platform.idempotency_key (
  user_id uuid NOT NULL, key text NOT NULL, method text NOT NULL, path text NOT NULL,
  request_hash bytea NOT NULL, status_code smallint, response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE platform.feature_flag (
  key text NOT NULL, organization_id uuid, enabled boolean NOT NULL, rollout jsonb,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (key, organization_id)
);

CREATE TABLE platform.file_object (
  id uuid PRIMARY KEY, organization_id uuid, storage_driver text NOT NULL, storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL, size_bytes bigint NOT NULL, sha256 bytea NOT NULL, original_name text,
  purpose text NOT NULL, uploaded_by uuid, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);

CREATE TABLE platform.counter (organization_id uuid NOT NULL, name text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1, PRIMARY KEY (organization_id, name));

CREATE TABLE platform.import_batch (                     -- RN-I04
  id uuid PRIMARY KEY, organization_id uuid, kind text NOT NULL, file_id uuid, file_sha256 bytea NOT NULL,
  status text NOT NULL, rows_total int, rows_ok int, rows_failed int, errors jsonb,
  started_by uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);

-- Outbox (05 §3) -----------------------------------------------------------------------------------
-- Cualquiera escribe lo suyo, sin RETURNING; solo el worker (app.role = SYSTEM) lee, publica y limpia.
ALTER TABLE platform.outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.outbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_write ON platform.outbox_event FOR INSERT
  WITH CHECK (organization_id IS NULL OR organization_id = app.org_id() OR app.role() = 'SYSTEM');
CREATE POLICY outbox_system ON platform.outbox_event FOR ALL
  USING (app.role() = 'SYSTEM') WITH CHECK (app.role() = 'SYSTEM');
SELECT app.restrict_patient('platform.outbox_event', 'false', 'true');

-- Consumidores idempotentes: corren como SYSTEM.
ALTER TABLE platform.processed_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.processed_event FORCE ROW LEVEL SECURITY;
CREATE POLICY processed_system ON platform.processed_event FOR ALL
  USING (app.role() = 'SYSTEM') WITH CHECK (app.role() = 'SYSTEM');

-- Idempotency-Key: cada usuario ve y escribe solo sus claves; SYSTEM borra las vencidas.
ALTER TABLE platform.idempotency_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.idempotency_key FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_owner_read ON platform.idempotency_key FOR SELECT
  USING (user_id = app.user_id());
CREATE POLICY idempotency_owner_insert ON platform.idempotency_key FOR INSERT
  WITH CHECK (user_id = app.user_id());
CREATE POLICY idempotency_owner_update ON platform.idempotency_key FOR UPDATE
  USING (user_id = app.user_id()) WITH CHECK (user_id = app.user_id());
CREATE POLICY idempotency_system ON platform.idempotency_key FOR ALL
  USING (app.role() = 'SYSTEM') WITH CHECK (app.role() = 'SYSTEM');

-- Banderas, archivos e importaciones: lo global (organization_id NULL) lo escribe SYSTEM.
SELECT app.enable_catalog_rls('platform.feature_flag');
SELECT app.enable_catalog_rls('platform.file_object');
SELECT app.enable_catalog_rls('platform.import_batch');
SELECT app.enable_tenant_rls('platform.counter');

-- El paciente lee las banderas y solo los archivos de sus fichas, de sus recursos asignados y de la marca
-- de su organización.
SELECT app.restrict_patient('platform.feature_flag', 'true');
SELECT app.restrict_patient('platform.file_object',
  'EXISTS (SELECT 1 FROM documents.generated_document d
           WHERE d.file_id = file_object.id AND d.patient_id = app.patient_id())
   OR EXISTS (SELECT 1 FROM content.educational_resource r
              JOIN content.resource_assignment a ON a.resource_id = r.id
              WHERE r.file_id = file_object.id AND a.patient_id = app.patient_id())
   OR EXISTS (SELECT 1 FROM tenancy.branding b
              WHERE file_object.id IN (b.logo_file_id, b.avatar_file_id))');
SELECT app.restrict_patient('platform.counter');
SELECT app.restrict_patient('platform.import_batch');

-- Permisos -----------------------------------------------------------------------------------------
-- Limpieza que hace SYSTEM: outbox publicado de más de 7 días, eventos procesados de más de 30 y claves
-- de idempotencia vencidas.
GRANT DELETE ON platform.outbox_event, platform.processed_event, platform.idempotency_key TO app_user;
