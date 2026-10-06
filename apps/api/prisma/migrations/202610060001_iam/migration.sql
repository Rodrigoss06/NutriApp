-- 0001 · iam (Notion 05.1). Usuarios globales: sin organization_id ni RLS, salvo la invitación.

CREATE TABLE iam.user_account (
  id                 uuid PRIMARY KEY,
  email              citext NOT NULL UNIQUE,
  email_verified_at  timestamptz,
  password_hash      text,                         -- argon2id; NULL hasta aceptar la invitación
  display_name       text NOT NULL,
  status             text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','LOCKED','DISABLED')),
  is_platform_admin  boolean NOT NULL DEFAULT false,
  failed_logins      smallint NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  last_login_at      timestamptz,
  locale             text NOT NULL DEFAULT 'es-PE',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.session (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES iam.user_account(id),
  token_hash          bytea NOT NULL UNIQUE,         -- SHA-256 del token opaco de 256 bits
  kind                text NOT NULL CHECK (kind IN ('STAFF','PATIENT','PLATFORM')),
  active_org_id       uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at          timestamptz,
  ip                  inet,
  user_agent          text
);
CREATE INDEX session_user_active ON iam.session (user_id) WHERE revoked_at IS NULL;

CREATE TABLE iam.invitation (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  email           citext NOT NULL,
  role            text NOT NULL CHECK (role IN ('OWNER','ADMIN','PROFESSIONAL','PATIENT')),
  patient_id      uuid,                              -- cuando role = PATIENT
  token_hash      bytea NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  invited_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.password_reset (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES iam.user_account(id),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS de la invitación (RN-A01). Antes de que exista una sesión, la invitación se busca solo con
-- app.find_invitation; con ella, el caso de uso abre la UnitOfWork con su organization_id.
SELECT app.enable_tenant_rls('iam.invitation');
SELECT app.restrict_patient('iam.invitation');

-- Una invitación no se edita: solo se acepta o se revoca.
REVOKE UPDATE ON iam.invitation FROM app_user;
GRANT UPDATE (accepted_at, revoked_at) ON iam.invitation TO app_user;

-- Búsqueda por el hash exacto del token, sin sesión ni organización. Devuelve solo lo necesario para
-- validar la invitación y abrir la UnitOfWork.
CREATE FUNCTION app.find_invitation(p_token_hash bytea)
RETURNS TABLE (
  id uuid, organization_id uuid, email citext, role text, patient_id uuid,
  expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT i.id, i.organization_id, i.email, i.role, i.patient_id, i.expires_at, i.accepted_at, i.revoked_at
  FROM iam.invitation i
  WHERE i.token_hash = p_token_hash
$$;

GRANT EXECUTE ON FUNCTION app.find_invitation(bytea) TO app_user;
