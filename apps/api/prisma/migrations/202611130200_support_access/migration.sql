-- P15 · PR 4 · el soporte con permiso del dueño (RN-A09; ADR-129): el dueño da y revoca permisos de soporte, con motivo y caducidad;
-- el soporte solo lee los suyos y nunca se da uno.

-- Quién da y quién ve los permisos. Antes, platform_admin dejaba a la plataforma escribirlos (y darse uno) y tenant_isolation, a
-- cualquier miembro: ahora solo el dueño los da y los revoca, y la plataforma lee los que le dieron a ella.
DROP POLICY platform_admin ON tenancy.support_access_grant;
CREATE POLICY support_reads_own ON tenancy.support_access_grant FOR SELECT
  USING (app.role() = 'PLATFORM_ADMIN' AND support_user_id = app.user_id());
CREATE POLICY owner_or_own_support ON tenancy.support_access_grant AS RESTRICTIVE FOR SELECT
  USING (app.role() = 'OWNER' OR (app.role() = 'PLATFORM_ADMIN' AND support_user_id = app.user_id()));
CREATE POLICY owner_grants ON tenancy.support_access_grant AS RESTRICTIVE FOR INSERT
  WITH CHECK (app.role() = 'OWNER' AND granted_by = app.user_id());
CREATE POLICY owner_revokes ON tenancy.support_access_grant AS RESTRICTIVE FOR UPDATE
  USING (app.role() = 'OWNER')
  WITH CHECK (app.role() = 'OWNER');
-- Un permiso no se edita ni se borra: solo se revoca.
REVOKE UPDATE ON tenancy.support_access_grant FROM app_user;
GRANT UPDATE (revoked_at) ON tenancy.support_access_grant TO app_user;

ALTER TABLE tenancy.support_access_grant
  ADD CONSTRAINT support_access_grant_reason CHECK (char_length(reason) BETWEEN 3 AND 300),
  -- De 1 a 7 días (ADR-124): la API los cuenta desde created_at, que también fija.
  ADD CONSTRAINT support_access_grant_expiry CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '7 days'),
  ADD CONSTRAINT support_access_grant_revoked CHECK (revoked_at IS NULL OR revoked_at >= created_at);

CREATE INDEX support_access_grant_active ON tenancy.support_access_grant (support_user_id, organization_id)
  WHERE revoked_at IS NULL;
CREATE INDEX support_access_grant_by_org ON tenancy.support_access_grant (organization_id, created_at DESC);

-- Solo una persona de soporte de la plataforma recibe un permiso: la tabla no tiene clave foránea a iam.
CREATE FUNCTION app.ensure_support_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.user_account u
                 WHERE u.id = NEW.support_user_id AND u.is_platform_admin AND u.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'support_user_id no es una persona de soporte activa' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.ensure_support_user() FROM PUBLIC;
CREATE TRIGGER support_user_is_platform BEFORE INSERT ON tenancy.support_access_grant
  FOR EACH ROW EXECUTE FUNCTION app.ensure_support_user();

-- Las personas de soporte, para que el dueño elija a quién le da el permiso: solo el nombre, y solo al dueño.
CREATE FUNCTION app.platform_support_directory()
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, u.display_name
  FROM iam.user_account u
  WHERE app.role() = 'OWNER' AND u.is_platform_admin AND u.status = 'ACTIVE'
  ORDER BY u.display_name, u.id
$$;
REVOKE ALL ON FUNCTION app.platform_support_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.platform_support_directory() TO app_user;

-- Lo que faltaba de RN-A09: tablas con datos de un paciente que el soporte solo lee con un permiso CLINICAL_READ vigente y nunca
-- escribe, como el resto de los esquemas clínicos.
SELECT app.restrict_platform_admin(t)
FROM unnest(ARRAY[
  'scheduling.appointment',
  'content.resource_assignment', 'content.motivational_message', 'content.patient_app_setting',
  'assessment.method_preference'
]::regclass[]) AS t;
