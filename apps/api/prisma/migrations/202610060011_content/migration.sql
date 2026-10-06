-- 0011 · content (Notion 05.3).

CREATE TABLE content.educational_resource (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('FILE','LINK','VIDEO','ARTICLE')),
  file_id uuid, url text, body_markdown text, tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ACTIVE', created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content.resource_assignment (
  resource_id uuid NOT NULL REFERENCES content.educational_resource(id), patient_id uuid NOT NULL,
  organization_id uuid NOT NULL, assigned_by uuid NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz, PRIMARY KEY (resource_id, patient_id)
);
CREATE TABLE content.motivational_message (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, patient_id uuid,   -- NULL = para todos
  body text NOT NULL, active_from date, active_to date, schedule jsonb,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content.patient_app_setting (
  patient_id uuid PRIMARY KEY, organization_id uuid NOT NULL,
  theme_color text, welcome_message text,
  enabled_sections text[] NOT NULL DEFAULT '{NUTRITION,HYDRATION,TRAINING,CHECKIN,NOTES,EVOLUTION,RESOURCES}',
  allow_weight_log boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS ----------------------------------------------------------------------------------------------
SELECT app.enable_tenant_rls('content.educational_resource');
SELECT app.enable_tenant_rls('content.resource_assignment');
SELECT app.enable_tenant_rls('content.motivational_message');
SELECT app.enable_tenant_rls('content.patient_app_setting');

-- El paciente lee sus ajustes de la app, sus mensajes y los generales, sus asignaciones y los recursos
-- que tiene asignados.
SELECT app.restrict_patient('content.patient_app_setting', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('content.motivational_message',
  'patient_id IS NULL OR patient_id = app.patient_id()');
SELECT app.restrict_patient('content.resource_assignment', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('content.educational_resource',
  'EXISTS (SELECT 1 FROM content.resource_assignment a
           WHERE a.resource_id = educational_resource.id AND a.patient_id = app.patient_id())');
