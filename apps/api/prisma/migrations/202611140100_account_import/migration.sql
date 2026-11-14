-- P15, PR 7a (RF-40, RN-I05; ADR-135): la migración de hasta cinco cuentas de nutricionista desde la plantilla CSV propia. Los
-- pacientes, sus evaluaciones y sus planes entran con los casos de uso de cada contexto, a nombre del nutricionista de la cuenta;
-- quién corrió la importación queda en el lote (platform.import_batch).

-- Lo que ya entró de cada cuenta, para que reimportar no duplique (RN-I05): el id de la fila en la plantilla (id_origen) y lo que
-- se creó con ella. Se escribe en la misma transacción que lo creado. No guarda datos personales: el id de origen es el del sistema
-- anterior, nunca el documento. Queda después de una supresión (RN-B05): así reimportar no devuelve al paciente suprimido.
CREATE TABLE platform.import_record (
  organization_id   uuid NOT NULL,
  account_member_id uuid NOT NULL REFERENCES tenancy.member(id),
  entity            text NOT NULL CHECK (entity IN ('PATIENT','EVALUATION','PLAN')),
  external_id       text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 64),
  entity_id         uuid NOT NULL,
  batch_id          uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, account_member_id, entity, external_id)
);
SELECT app.enable_tenant_rls('platform.import_record');
SELECT app.restrict_platform_admin('platform.import_record');
SELECT app.restrict_account('platform.import_record');
SELECT app.restrict_patient('platform.import_record');
-- Solo se agrega: ni se cambia ni se borra.
REVOKE UPDATE ON platform.import_record FROM app_user;

-- Un archivo de catálogo se aplica una sola vez (ADR-052). Los de una cuenta se pueden volver a correr: lo que ya entró se salta por
-- import_record y lo que falló entra cuando se corrige (el cupo, un consentimiento). Por eso el índice deja fuera ACCOUNT_*.
DROP INDEX platform.import_batch_once;
CREATE UNIQUE INDEX import_batch_once ON platform.import_batch (organization_id, kind, file_sha256) NULLS NOT DISTINCT
  WHERE status IN ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS') AND kind NOT LIKE 'ACCOUNT\_%';

-- El consentimiento de datos de salud que el paciente dio en el sistema anterior: entra como MIGRATED con esa fecha, sin evidencia
-- ni IP (Rodrigo, 2026-11-14; pendiente de validación legal). Solo lo escribe la importación.
ALTER TABLE clinical.consent DROP CONSTRAINT consent_channel_check;
ALTER TABLE clinical.consent
  ADD CONSTRAINT consent_channel_check CHECK (channel IN ('APP','IN_PERSON_DIGITAL','PAPER_SCANNED','MIGRATED')),
  ADD CONSTRAINT consent_migrated CHECK (channel <> 'MIGRATED'
    OR (purpose = 'HEALTH_DATA' AND evidence_file_id IS NULL AND ip IS NULL AND user_agent IS NULL));

-- Los planes del sistema anterior, como historial de solo lectura (Rodrigo, 2026-11-14): sus metas y sus indicaciones, sin tiempos
-- de comida ni prescripción. No son planes de NutriCoach: un plan nace de una prescripción del motor (RF-18, RN-D01). La supresión
-- vacía sus indicaciones.
CREATE TABLE nutrition.imported_plan (
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  patient_id          uuid NOT NULL REFERENCES clinical.patient(id),
  valid_from          date NOT NULL,
  valid_to            date,
  target_kcal         numeric(7,1) CHECK (target_kcal > 0),
  target_protein_g    numeric(6,1) CHECK (target_protein_g >= 0),
  target_fat_g        numeric(6,1) CHECK (target_fat_g >= 0),
  target_cho_g        numeric(6,1) CHECK (target_cho_g >= 0),
  hydration_target_ml int CHECK (hydration_target_ml > 0),
  instructions        text CHECK (char_length(instructions) <= 4000),
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX imported_plan_by_patient ON nutrition.imported_plan (organization_id, patient_id, valid_from DESC);
SELECT app.enable_tenant_rls('nutrition.imported_plan');
SELECT app.restrict_platform_admin('nutrition.imported_plan');
SELECT app.enable_care_team_scope('nutrition.imported_plan');
SELECT app.restrict_account('nutrition.imported_plan');
SELECT app.restrict_patient('nutrition.imported_plan');
-- Historial: no se cambia ni se borra. Solo la supresión (app_owner) vacía sus indicaciones.
REVOKE UPDATE ON nutrition.imported_plan FROM app_user;

-- La supresión (ADR-133) suma las indicaciones de los planes importados.
CREATE OR REPLACE FUNCTION clinical.anonymize_patient(p_patient_id uuid) RETURNS SETOF text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
$$
DECLARE
  v_patient clinical.patient%ROWTYPE;
  v_now     timestamptz := now();
  v_shared  boolean;
  v_keys    text[];
BEGIN
  IF app.role() IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'Solo el dueño de la organización suprime a un paciente (RN-B05)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_patient FROM clinical.patient
  WHERE id = p_patient_id AND organization_id = app.org_id() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente % no encontrado', p_patient_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_patient.status <> 'ARCHIVED' OR v_patient.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se suprime un paciente archivado, una vez (RN-B05)' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.anonymizing', 'on', true);

  -- clinical
  UPDATE clinical.patient
  SET first_name = 'Anonimizado', last_name = 'Anonimizado', gender_identity = NULL, document_type = NULL,
      document_number_enc = NULL, document_number_bidx = NULL, email = NULL, phone_enc = NULL,
      birth_date = make_date(extract(year FROM birth_date)::int, 1, 1), tags = '{}', user_id = NULL,
      anonymized_at = v_now, updated_at = v_now, version = version + 1
  WHERE id = p_patient_id;
  UPDATE clinical.consent SET ip = NULL, user_agent = NULL WHERE patient_id = p_patient_id;
  UPDATE clinical.clinical_history SET answers = '{}'::jsonb WHERE patient_id = p_patient_id;
  UPDATE clinical.clinical_note SET body = 'Anonimizado' WHERE patient_id = p_patient_id;
  UPDATE clinical.condition SET label = 'Anonimizado', notes = NULL WHERE patient_id = p_patient_id;
  UPDATE clinical.goal SET notes = NULL WHERE patient_id = p_patient_id;
  UPDATE clinical.pre_exercise_screening SET review_note = NULL WHERE patient_id = p_patient_id;
  UPDATE clinical.record_document
  SET title = 'Documento', link_url = NULL, review_note = NULL,
      deleted_at = coalesce(deleted_at, v_now), deleted_by = coalesce(deleted_by, app.user_id())
  WHERE patient_id = p_patient_id;

  -- assessment
  UPDATE assessment.evaluation
  SET notes = NULL, amend_reason = CASE WHEN amend_reason IS NULL THEN NULL ELSE 'Anonimizado' END,
      conditions = app.anonymize_json(conditions)
  WHERE patient_id = p_patient_id;
  UPDATE assessment.movement_screen
  SET observation = NULL, action_note = NULL, reliability_note = NULL, evidence_url = NULL
  WHERE patient_id = p_patient_id;
  UPDATE assessment.physical_test_result SET notes = NULL, evidence_url = NULL WHERE patient_id = p_patient_id;

  -- nutrition
  UPDATE nutrition.plan SET instructions = NULL, snapshot = app.anonymize_json(snapshot) WHERE patient_id = p_patient_id;
  UPDATE nutrition.energy_prescription SET activities = app.anonymize_json(activities) WHERE patient_id = p_patient_id;
  UPDATE nutrition.imported_plan SET instructions = NULL WHERE patient_id = p_patient_id;

  -- training
  UPDATE training.athlete_profile SET injuries_note = NULL, restrictions_note = NULL, notes = NULL
  WHERE patient_id = p_patient_id;
  UPDATE training.program SET name = 'Programa', snapshot = app.anonymize_json(snapshot, 'program')
  WHERE patient_id = p_patient_id;
  UPDATE training.mesocycle SET name = 'Mesociclo', focus = NULL
  WHERE program_id IN (SELECT id FROM training.program WHERE patient_id = p_patient_id);
  UPDATE training.session SET name = 'Sesión', notes = NULL
  WHERE week_id IN (SELECT w.id FROM training.program_week w JOIN training.mesocycle m ON m.id = w.mesocycle_id
                    JOIN training.program p ON p.id = m.program_id WHERE p.patient_id = p_patient_id);
  UPDATE training.prescribed_exercise SET notes = NULL, substitution_note = NULL
  WHERE session_id IN (SELECT s.id FROM training.session s JOIN training.program_week w ON w.id = s.week_id
                       JOIN training.mesocycle m ON m.id = w.mesocycle_id
                       JOIN training.program p ON p.id = m.program_id WHERE p.patient_id = p_patient_id);
  UPDATE training.weekly_review SET decision_note = NULL WHERE patient_id = p_patient_id;
  UPDATE training.mesocycle_report
  SET achievement = CASE WHEN achievement IS NULL THEN NULL ELSE '' END,
      limitation = CASE WHEN limitation IS NULL THEN NULL ELSE '' END,
      adjustment = CASE WHEN adjustment IS NULL THEN NULL ELSE '' END,
      priority = CASE WHEN priority IS NULL THEN NULL ELSE '' END,
      student_comment = NULL, student_commented_at = NULL,
      snapshot = app.anonymize_json(snapshot)
  WHERE patient_id = p_patient_id;

  -- tracking
  UPDATE tracking.note_log SET body = 'Anonimizado' WHERE patient_id = p_patient_id;
  UPDATE tracking.workout_log SET notes = NULL WHERE patient_id = p_patient_id;
  UPDATE tracking.log_adjustment SET reason = 'Anonimizado' WHERE patient_id = p_patient_id;
  UPDATE tracking.device_reading SET raw = '{}'::jsonb, external_id = 'anonimizado-' || id::text
  WHERE patient_id = p_patient_id;
  UPDATE tracking.active_plan_view
  SET nutrition_snapshot = app.anonymize_json(nutrition_snapshot),
      training_snapshot = app.anonymize_json(training_snapshot, 'program')
  WHERE patient_id = p_patient_id;

  -- scheduling y content
  UPDATE scheduling.appointment SET location = NULL, meeting_url = NULL, notes = NULL WHERE patient_id = p_patient_id;
  UPDATE content.motivational_message SET body = 'Anonimizado' WHERE patient_id = p_patient_id;
  UPDATE content.patient_app_setting SET welcome_message = NULL WHERE patient_id = p_patient_id;

  -- La cuenta de la app: se desactiva y pierde su correo y su nombre, salvo que la use otra organización o el equipo; entonces solo
  -- se desvincula. Sus sesiones de paciente se cierran. Las invitaciones pierden el correo y las pendientes quedan revocadas.
  IF v_patient.user_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM tenancy.member m WHERE m.user_id = v_patient.user_id)
        OR EXISTS (SELECT 1 FROM clinical.patient p WHERE p.user_id = v_patient.user_id AND p.id <> p_patient_id)
      INTO v_shared;
    DELETE FROM iam.session WHERE user_id = v_patient.user_id AND kind = 'PATIENT';
    IF NOT v_shared THEN
      DELETE FROM iam.session WHERE user_id = v_patient.user_id;
      DELETE FROM iam.password_reset WHERE user_id = v_patient.user_id;
      UPDATE iam.user_account
      SET email = 'anonimizado-' || id::text || '@anonimizado.invalid', display_name = 'Anonimizado',
          password_hash = NULL, email_verified_at = NULL, status = 'DISABLED', updated_at = v_now
      WHERE id = v_patient.user_id;
    END IF;
  END IF;
  UPDATE iam.invitation
  SET email = 'anonimizado-' || id::text || '@anonimizado.invalid',
      revoked_at = CASE WHEN accepted_at IS NULL AND revoked_at IS NULL THEN v_now ELSE revoked_at END
  WHERE patient_id = p_patient_id;

  -- Lo que guardó la idempotencia de las respuestas con este paciente (puede traer su nombre) y de su cuenta.
  DELETE FROM platform.idempotency_key
  WHERE strpos(response::text, p_patient_id::text) > 0
     OR (v_patient.user_id IS NOT NULL AND user_id = v_patient.user_id);

  PERFORM set_config('app.anonymizing', 'off', true);

  -- Sus archivos (fotos, expediente, evidencias, fichas y exportaciones): marcados borrados; los bytes los borra la aplicación.
  WITH retired AS (
    UPDATE platform.file_object SET deleted_at = v_now
    WHERE patient_id = p_patient_id AND deleted_at IS NULL
    RETURNING storage_key
  )
  SELECT coalesce(array_agg(storage_key), '{}') INTO v_keys FROM retired;
  RETURN QUERY SELECT unnest(v_keys);
END
$$;
