-- 0002 · tenancy (Notion 05.1). PLATFORM_ADMIN tiene políticas propias solo en este esquema (05 §3).

CREATE TABLE tenancy.subscription_plan (           -- tramos de membresía (N9)
  id                  uuid PRIMARY KEY,
  code                text NOT NULL UNIQUE,          -- 'TRAMO_5', 'TRAMO_50'
  name                text NOT NULL,
  max_active_patients int NOT NULL,
  max_professionals   int NOT NULL,
  duration_months     smallint NOT NULL DEFAULT 12,
  price_cents         bigint NOT NULL,
  currency            char(3) NOT NULL DEFAULT 'PEN',
  features            jsonb NOT NULL DEFAULT '{}',   -- banderas incluidas en el plan
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenancy.organization (
  id                 uuid PRIMARY KEY,
  name               text NOT NULL,
  slug               text NOT NULL UNIQUE,
  legal_name         text,
  tax_id             text,                           -- RUC, opcional
  country            char(2) NOT NULL DEFAULT 'PE',
  timezone           text NOT NULL DEFAULT 'America/Lima',
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','READ_ONLY','SUSPENDED','CLOSED')),
  patient_visibility text NOT NULL DEFAULT 'CARE_TEAM' CHECK (patient_visibility IN ('CARE_TEAM','ORGANIZATION')),
  patient_label      text NOT NULL DEFAULT 'Paciente', -- 'Asesorado', 'Cliente'
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            int NOT NULL DEFAULT 0
);

CREATE TABLE tenancy.subscription (                -- nunca se edita: cambiar de plan crea otra fila
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL REFERENCES tenancy.organization(id),
  plan_id             uuid NOT NULL REFERENCES tenancy.subscription_plan(id),
  status              text NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED','REPLACED')),
  starts_on           date NOT NULL,
  ends_on             date NOT NULL,
  price_cents         bigint NOT NULL,               -- precio pactado, congelado
  currency            char(3) NOT NULL,
  max_active_patients int NOT NULL,                  -- límites congelados
  max_professionals   int NOT NULL,
  changed_by          uuid NOT NULL,
  change_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscription_one_active ON tenancy.subscription (organization_id) WHERE status = 'ACTIVE';

CREATE TABLE tenancy.member (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES tenancy.organization(id),
  user_id         uuid NOT NULL,                     -- iam.user_account, sin clave foránea
  role            text NOT NULL CHECK (role IN ('OWNER','ADMIN','PROFESSIONAL')),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REMOVED')),
  profession      text CHECK (profession IN ('NUTRITIONIST','TRAINER','BOTH','OTHER')),
  license_number  text,                              -- colegiatura
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE tenancy.branding (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES tenancy.organization(id),
  member_id       uuid REFERENCES tenancy.member(id), -- NULL = marca de la organización
  display_name    text,
  logo_file_id    uuid,
  avatar_file_id  uuid,
  primary_color   text CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  contact         jsonb NOT NULL DEFAULT '{}',       -- teléfono, correo, web, redes
  pdf_footer      text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, member_id)
);

CREATE TABLE tenancy.organization_setting (         -- rango de adecuación, métodos por defecto, ventana editable...
  organization_id uuid NOT NULL REFERENCES tenancy.organization(id),
  key             text NOT NULL,
  value           jsonb NOT NULL,
  updated_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);

CREATE TABLE tenancy.support_access_grant (         -- RN-A09
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES tenancy.organization(id),
  support_user_id uuid NOT NULL,
  scope           text NOT NULL CHECK (scope IN ('ACCOUNT','CLINICAL_READ')),
  reason          text NOT NULL,
  granted_by      uuid NOT NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS ----------------------------------------------------------------------------------------------
ALTER TABLE tenancy.organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.organization FORCE ROW LEVEL SECURITY;
-- La organización activa, más aquellas donde el usuario es miembro (para elegir la activa al entrar).
-- Crear una organización funciona porque el dominio genera su id y la transacción fija app.org_id con él.
CREATE POLICY tenant_isolation ON tenancy.organization
  USING (id = app.org_id())
  WITH CHECK (id = app.org_id());
CREATE POLICY member_self ON tenancy.organization FOR SELECT
  USING (id IN (SELECT m.organization_id FROM tenancy.member m
                WHERE m.user_id = app.user_id() AND m.status = 'ACTIVE'));

SELECT app.enable_tenant_rls('tenancy.subscription');
SELECT app.enable_tenant_rls('tenancy.member');
SELECT app.enable_tenant_rls('tenancy.branding');
SELECT app.enable_tenant_rls('tenancy.organization_setting');
SELECT app.enable_tenant_rls('tenancy.support_access_grant');

CREATE POLICY member_self ON tenancy.member FOR SELECT
  USING (user_id = app.user_id());

-- Panel interno: PLATFORM_ADMIN opera organizaciones, planes, suscripciones y soporte.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenancy.organization', 'tenancy.subscription', 'tenancy.member',
                           'tenancy.branding', 'tenancy.organization_setting',
                           'tenancy.support_access_grant'] LOOP
    EXECUTE format('CREATE POLICY platform_admin ON %s
                      USING (app.role() = ''PLATFORM_ADMIN'')
                      WITH CHECK (app.role() = ''PLATFORM_ADMIN'')', t);
  END LOOP;
END $$;

-- El paciente lee su organización, su marca y los ajustes que validan sus registros (ventana editable,
-- RN-G10). No escribe nada aquí.
SELECT app.restrict_patient('tenancy.organization', 'id = app.org_id()');
SELECT app.restrict_patient('tenancy.branding', 'true');
SELECT app.restrict_patient('tenancy.organization_setting', 'true');
SELECT app.restrict_patient('tenancy.subscription');
SELECT app.restrict_patient('tenancy.member');
SELECT app.restrict_patient('tenancy.support_access_grant');

-- Permisos -----------------------------------------------------------------------------------------
-- La suscripción nunca se edita: solo cambia su estado al reemplazarla, vencer o cancelarla.
REVOKE UPDATE ON tenancy.subscription FROM app_user;
GRANT UPDATE (status) ON tenancy.subscription TO app_user;

-- Soporte con permiso clínico vigente (RN-A09) para el usuario y la organización del contexto. La usan
-- las políticas restrictivas de los esquemas clínicos; lee la tabla sin RLS porque es de app_owner.
CREATE FUNCTION app.has_clinical_support_grant() RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenancy.support_access_grant g
    WHERE g.organization_id = app.org_id()
      AND g.support_user_id = app.user_id()
      AND g.scope = 'CLINICAL_READ'
      AND g.revoked_at IS NULL
      AND g.expires_at > now()
  )
$$;

GRANT EXECUTE ON FUNCTION app.has_clinical_support_grant() TO app_user, app_readonly;
