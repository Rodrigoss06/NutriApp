-- P6 · ACCOUNT como lista de lo permitido y documento repetido auditado.

-- ACCOUNT existe solo dentro de la transacción que acepta una invitación, nunca en una sesión. Aunque
-- app.can_see_patient lo deje pasar para su paciente, en los datos clínicos solo ve y escribe la ficha (para vincular
-- su cuenta) y sus consentimientos (los que da al aceptar). Nunca historia, condiciones, objetivos, notas, borradores
-- ni registros. Igual que app.restrict_patient: sin argumentos, no ve ni escribe nada.
CREATE FUNCTION app.restrict_account(p_table regclass, p_read text DEFAULT 'false', p_write text DEFAULT 'false')
RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  EXECUTE format('CREATE POLICY account_scope ON %s AS RESTRICTIVE
                    USING (app.role() IS DISTINCT FROM ''ACCOUNT'' OR (%s))
                    WITH CHECK (app.role() IS DISTINCT FROM ''ACCOUNT'' OR (%s))',
                 p_table, p_read, p_write);
END $$;

REVOKE ALL ON FUNCTION app.restrict_account(regclass, text, text) FROM PUBLIC;

SELECT app.restrict_account('clinical.patient', 'true', 'true');
SELECT app.restrict_account('clinical.consent', 'true', 'true');
SELECT app.restrict_account(t)
FROM unnest(ARRAY[
  'clinical.care_team_member', 'clinical.clinical_history', 'clinical.condition', 'clinical.goal',
  'clinical.clinical_note',
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

-- Documento repetido: la respuesta dice si alguien ya es paciente de la organización, así que funciona como oráculo.
-- Cada coincidencia deja en la auditoría el intento, con el paciente encontrado y el actor (RN-B03).
CREATE OR REPLACE FUNCTION app.patient_document_taken(p_bidx bytea, p_except uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_patient uuid;
BEGIN
  SELECT id INTO v_patient FROM clinical.patient
  WHERE organization_id = app.org_id() AND document_number_bidx = p_bidx
    AND (p_except IS NULL OR id <> p_except)
  LIMIT 1;
  IF v_patient IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO audit.audit_log (id, occurred_at, organization_id, actor_user_id, actor_role, action, resource_type,
                               resource_id, patient_id, changed_fields, outcome)
  VALUES (uuidv7(), clock_timestamp(), app.org_id(), app.user_id(), app.role(), 'READ', 'clinical.patient',
          v_patient, v_patient, ARRAY['document_check'], 'DENIED');
  RETURN true;
END $$;
