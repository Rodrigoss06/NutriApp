-- P6 · Expediente: historia, condiciones, objetivos y notas inmutables o con cambios acotados, y acceso del paciente.

-- Permisos ---------------------------------------------------------------------------------------------
-- Una nota clínica no se edita: se enmienda con una nota nueva (amends_note_id). De condiciones y objetivos solo
-- cambian el estado y las notas; lo que se registró queda como se registró.
REVOKE UPDATE ON clinical.clinical_note FROM app_user;
REVOKE UPDATE ON clinical.condition, clinical.goal FROM app_user;
GRANT UPDATE (status, notes) ON clinical.condition, clinical.goal TO app_user;

-- Paciente de la cuenta del contexto -------------------------------------------------------------------
-- La cuenta de la app se vincula a un solo paciente (patient_user). Al entrar y en cada petición se resuelve aquí, sin
-- parámetro: solo app.user_id() del contexto, así que nadie consulta el vínculo de otra cuenta. has_access exige el
-- paciente activo y los consentimientos APP_ACCESS y HEALTH_DATA vigentes (RN-B02: revocar bloquea el acceso).
CREATE FUNCTION app.patient_of_account()
RETURNS TABLE (patient_id uuid, organization_id uuid, has_access boolean)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p.id, p.organization_id,
         p.status = 'ACTIVE'
         AND EXISTS (SELECT 1 FROM clinical.consent c
                     WHERE c.patient_id = p.id AND c.purpose = 'APP_ACCESS' AND c.revoked_at IS NULL)
         AND EXISTS (SELECT 1 FROM clinical.consent c
                     WHERE c.patient_id = p.id AND c.purpose = 'HEALTH_DATA' AND c.revoked_at IS NULL)
  FROM clinical.patient p
  WHERE app.user_id() IS NOT NULL AND p.user_id = app.user_id()
$$;

-- Vista previa de una invitación de paciente, antes de que exista cuenta o sesión: como app.find_invitation, se
-- busca por el hash exacto del token y solo si la invitación sigue pendiente. Devuelve lo mínimo para la página de
-- aceptación: nombre de pila, fecha de nacimiento y zona (¿es menor?) y qué consentimientos ya están vigentes.
CREATE FUNCTION app.patient_invitation_preview(p_token_hash bytea)
RETURNS TABLE (patient_id uuid, organization_id uuid, first_name text, birth_date date, timezone text,
               patient_status text, linked boolean, health_data_active boolean, app_access_active boolean)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p.id, p.organization_id, p.first_name, p.birth_date, p.timezone, p.status, p.user_id IS NOT NULL,
         EXISTS (SELECT 1 FROM clinical.consent c
                 WHERE c.patient_id = p.id AND c.purpose = 'HEALTH_DATA' AND c.revoked_at IS NULL),
         EXISTS (SELECT 1 FROM clinical.consent c
                 WHERE c.patient_id = p.id AND c.purpose = 'APP_ACCESS' AND c.revoked_at IS NULL)
  FROM iam.invitation i
  JOIN clinical.patient p ON p.id = i.patient_id AND p.organization_id = i.organization_id
  WHERE i.token_hash = p_token_hash AND i.role = 'PATIENT'
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
$$;

GRANT EXECUTE ON FUNCTION app.patient_of_account(), app.patient_invitation_preview(bytea) TO app_user;
