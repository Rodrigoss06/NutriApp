-- P6 · Acceso al expediente: equipo de atención en la base (RN-A05), notas AUTHOR_ONLY, una cuenta por paciente y
-- textos provisionales de consentimiento (RN-B01).

-- Miembro del contexto ---------------------------------------------------------------------------------
-- La UnitOfWork fija app.member_id con la fila de tenancy.member de quien actúa (OWNER, ADMIN o PROFESSIONAL).
CREATE FUNCTION app.member_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.member_id', true), '')::uuid $$;

-- ¿Quien actúa puede ver a este paciente? (RN-A05). SECURITY DEFINER de app_owner: consulta clinical.patient y
-- clinical.care_team_member sin pasar por su propia RLS (si no, la política de care_team_member se llamaría a sí
-- misma). Siempre dentro de la organización del contexto.
--   - OWNER ve a todos; ADMIN y PROFESSIONAL siguen RN-A05 (Ley 29733, proporcionalidad).
--   - Visibilidad ORGANIZATION: todos los miembros.
--   - CARE_TEAM: el responsable y los miembros del equipo de atención.
--   - PATIENT, SYSTEM y PLATFORM_ADMIN tienen políticas propias (patient_scope, worker, support_read_only).
--   - ACCOUNT (aceptar una invitación de paciente): la cuenta ya vinculada, o la que aceptó su invitación.
CREATE FUNCTION app.can_see_patient(p_patient_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN app.role() IN ('OWNER', 'PATIENT', 'SYSTEM', 'PLATFORM_ADMIN') THEN true
    WHEN app.role() IN ('ADMIN', 'PROFESSIONAL') THEN
      EXISTS (SELECT 1 FROM tenancy.organization o
              WHERE o.id = app.org_id() AND o.patient_visibility = 'ORGANIZATION')
      OR EXISTS (SELECT 1 FROM clinical.patient p
                 WHERE p.id = p_patient_id AND p.organization_id = app.org_id()
                   AND p.responsible_member_id = app.member_id())
      OR EXISTS (SELECT 1 FROM clinical.care_team_member c
                 WHERE c.patient_id = p_patient_id AND c.organization_id = app.org_id()
                   AND c.member_id = app.member_id())
    WHEN app.role() = 'ACCOUNT' THEN
      EXISTS (SELECT 1 FROM clinical.patient p
              WHERE p.id = p_patient_id AND p.organization_id = app.org_id() AND p.user_id = app.user_id())
      OR EXISTS (SELECT 1 FROM iam.invitation i
                 JOIN iam.user_account u ON u.id = app.user_id() AND u.email = i.email
                 WHERE i.patient_id = p_patient_id AND i.organization_id = app.org_id()
                   AND i.role = 'PATIENT' AND i.accepted_at IS NOT NULL AND i.revoked_at IS NULL)
    ELSE false
  END
$$;

-- Política restrictiva del equipo de atención en SELECT, UPDATE y DELETE. En INSERT basta la de organización: el
-- paciente se inserta antes que su fila de equipo. Una columna NULL (cita sin paciente, mensaje para todos) pasa.
CREATE FUNCTION app.enable_care_team_scope(p_table regclass, p_column text DEFAULT 'patient_id') RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_check text := format('(%1$I IS NULL OR app.can_see_patient(%1$I))', p_column);
BEGIN
  EXECUTE format('CREATE POLICY care_team_scope_select ON %s AS RESTRICTIVE FOR SELECT USING %s',
                 p_table, v_check);
  EXECUTE format('CREATE POLICY care_team_scope_update ON %s AS RESTRICTIVE FOR UPDATE USING %s WITH CHECK %s',
                 p_table, v_check, v_check);
  EXECUTE format('CREATE POLICY care_team_scope_delete ON %s AS RESTRICTIVE FOR DELETE USING %s',
                 p_table, v_check);
END $$;

REVOKE ALL ON FUNCTION app.enable_care_team_scope(regclass, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.member_id(), app.can_see_patient(uuid) TO app_user, app_readonly;

SELECT app.enable_care_team_scope('clinical.patient', 'id');
SELECT app.enable_care_team_scope(t)
FROM unnest(ARRAY[
  'clinical.care_team_member', 'clinical.consent', 'clinical.clinical_history', 'clinical.condition',
  'clinical.goal', 'clinical.clinical_note',
  'assessment.evaluation', 'assessment.calculation_result', 'assessment.result_metric',
  'assessment.method_preference',
  'nutrition.energy_prescription', 'nutrition.plan',
  'training.program',
  'tracking.active_plan_view', 'tracking.daily_target', 'tracking.food_log', 'tracking.hydration_log',
  'tracking.workout_log', 'tracking.set_log', 'tracking.daily_checkin', 'tracking.metric_log',
  'tracking.note_log', 'tracking.device_reading', 'tracking.log_adjustment',
  'analytics.patient_daily_summary', 'analytics.patient_weekly_muscle_volume',
  'analytics.exercise_one_rm_series', 'analytics.patient_overview',
  'documents.generated_document',
  'content.resource_assignment', 'content.motivational_message', 'content.patient_app_setting',
  'scheduling.appointment'
]::regclass[]) AS t;
-- Excepciones: audit.audit_log (el dueño consulta la auditoría de todos, RF-06) e iam.invitation (la busca
-- app.find_invitation y la gobierna iam; crear una de paciente exige ver al paciente en la aplicación).

-- Notas AUTHOR_ONLY: solo su autor, también frente a OWNER. SYSTEM las anonimiza (RN-B05).
CREATE POLICY author_only ON clinical.clinical_note AS RESTRICTIVE
  USING (visibility <> 'AUTHOR_ONLY' OR author_member_id = app.member_id() OR app.role() = 'SYSTEM')
  WITH CHECK (visibility <> 'AUTHOR_ONLY' OR author_member_id = app.member_id() OR app.role() = 'SYSTEM');

-- Una cuenta de paciente se vincula a un solo paciente en la versión 1.0.
CREATE UNIQUE INDEX patient_user ON clinical.patient (user_id) WHERE user_id IS NOT NULL;

-- Textos de consentimiento provisionales (RN-B01) ---------------------------------------------------------
-- Textos de la plataforma (organization_id NULL), versión 0.1-provisional. Pendientes de revisión legal: los del
-- abogado del cliente entran como versión nueva. Idempotente.
INSERT INTO clinical.consent_document (id, organization_id, purpose, version, body_markdown, sha256, published_at)
SELECT d.id, NULL, d.purpose, '0.1-provisional', d.body, sha256(convert_to(d.body, 'UTF8')), now()
FROM (VALUES
  ('01926000-0000-7000-8000-000000000001'::uuid, 'HEALTH_DATA',
   E'**Texto provisional, pendiente de revisión legal.**\n\n'
   'Autorizo a la organización que me atiende a registrar y tratar mis datos de salud (medidas corporales, '
   'historia clínica, alimentación, entrenamiento y registros diarios) con la finalidad de evaluar mi estado, '
   'prescribir mi plan y hacer su seguimiento, conforme a la Ley 29733 de Protección de Datos Personales.\n\n'
   'Puedo revocar esta autorización en cualquier momento. Revocarla impide registrar datos nuevos; lo ya '
   'registrado se conserva en solo lectura hasta que pida su supresión.'),
  ('01926000-0000-7000-8000-000000000002'::uuid, 'APP_ACCESS',
   E'**Texto provisional, pendiente de revisión legal.**\n\n'
   'Acepto usar la aplicación para ver mi plan y registrar lo que como, bebo y entreno. Mis registros los ve el '
   'equipo de atención de la organización que me atiende.\n\n'
   'Puedo revocar este acceso en cualquier momento; al hacerlo se cierran mis sesiones en la aplicación.')
) AS d(id, purpose, body)
ON CONFLICT DO NOTHING;
