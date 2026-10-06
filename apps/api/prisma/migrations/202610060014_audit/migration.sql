-- 0014 · audit (Notion 05.3). Solo se agrega (RN-B03): app_user tiene INSERT y SELECT por defecto en este
-- esquema, nunca UPDATE ni DELETE.

CREATE TABLE audit.audit_log (
  id               uuid NOT NULL,
  occurred_at      timestamptz NOT NULL,
  organization_id  uuid,
  actor_user_id    uuid,
  actor_role       text,
  support_grant_id uuid,                                 -- si actuó soporte con permiso concedido
  action           text NOT NULL,                        -- READ, CREATE, UPDATE, PUBLISH, EXPORT, LOGIN, LOGIN_FAILED...
  resource_type    text NOT NULL,
  resource_id      uuid,
  patient_id       uuid,
  request_id       text,
  ip               inet,
  user_agent       text,
  changed_fields   text[],                               -- nombres de campos, nunca valores clínicos
  outcome          text NOT NULL DEFAULT 'SUCCESS',
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX audit_by_patient ON audit.audit_log (organization_id, patient_id, occurred_at DESC);
CREATE INDEX audit_time ON audit.audit_log USING brin (occurred_at);

-- RLS ----------------------------------------------------------------------------------------------
-- Se escribe lo de la organización del contexto o lo que no tiene organización (un ingreso fallido); se lee
-- solo lo de la organización del contexto.
ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON audit.audit_log FOR INSERT
  WITH CHECK (organization_id IS NULL OR organization_id = app.org_id());
CREATE POLICY audit_read ON audit.audit_log FOR SELECT
  USING (organization_id = app.org_id());
-- Los actos del paciente se auditan; él no lee la auditoría.
SELECT app.restrict_patient('audit.audit_log', 'false', 'true');

-- Particiones (05 §5), en UTC.
SELECT app.ensure_monthly_partitions('audit.audit_log', 3, '2026-10-01');
