-- P15 · PR 6a · la supresión del paciente por anonimización (RN-B05; plan aprobado el 2026-11-13, ADR-124; ADR-133): solo de un
-- paciente archivado y la confirma el dueño. Reemplaza nombres por «Anonimizado», borra documento, teléfono y correo, deja solo el año
-- de nacimiento, vacía todo texto escrito por personas (decisión de Rodrigo del 2026-11-13: también dentro de lo publicado), desactiva
-- la cuenta y borra sus archivos (05 §11). Quedan los códigos, los números, los métodos y la estructura, sin identificación.

-- El paciente suprimido sigue archivado (en la 1.0 solo ACTIVE y ARCHIVED, que todas las reglas ya leen) y no se reactiva.
ALTER TABLE clinical.patient
  ADD COLUMN anonymized_at timestamptz,
  ADD CONSTRAINT patient_anonymized_archived CHECK (anonymized_at IS NULL OR status = 'ARCHIVED');

-- Si corre la supresión: solo dentro de clinical.anonymize_patient, que es de app_owner (SECURITY DEFINER) y fija app.anonymizing. app_user
-- puede fijar la variable, pero nunca es app_owner: no le sirve para saltarse nada.
CREATE FUNCTION app.anonymizing() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS
$$ SELECT current_user = 'app_owner' AND coalesce(current_setting('app.anonymizing', true), '') = 'on' $$;
-- La llaman los disparadores de inmutabilidad, que corren con el rol de quien escribe.
GRANT EXECUTE ON FUNCTION app.anonymizing() TO app_user, app_readonly;

-- Un paciente suprimido ya no cambia: ni su ficha ni su estado.
CREATE FUNCTION clinical.guard_anonymized_patient() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS
$$
BEGIN
  IF app.anonymizing() OR OLD.anonymized_at IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El paciente % fue suprimido: ya no cambia (RN-B05)', OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END
$$;
CREATE TRIGGER patient_anonymized_frozen BEFORE UPDATE ON clinical.patient
  FOR EACH ROW EXECUTE FUNCTION clinical.guard_anonymized_patient();

-- Los textos libres dentro de un snapshot (plan, programa, informe y la vista del plan activo): las indicaciones del plan, las notas y la
-- sustitución de cada sesión y ejercicio, el foco del mesociclo y los nombres que escribe el coach (programa, mesociclo, sesión). Los
-- nombres y textos que vienen de los catálogos (alimentos, recetas, ejercicios) quedan. p_parent es la clave que contiene al objeto.
CREATE FUNCTION app.anonymize_json(p_doc jsonb, p_parent text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS
$$
DECLARE
  v_key   text;
  v_value jsonb;
  v_out   jsonb;
BEGIN
  IF p_doc IS NULL THEN
    RETURN NULL;
  END IF;
  CASE jsonb_typeof(p_doc)
    WHEN 'object' THEN
      v_out := '{}'::jsonb;
      FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_doc) LOOP
        IF jsonb_typeof(v_value) = 'string' AND (
             (v_key = 'instructions' AND p_parent IS NULL)
             OR (v_key = 'notes' AND p_parent IN ('sessions', 'exercises'))
             OR v_key = 'substitutionNote'
             OR (v_key = 'focus' AND p_parent IN ('mesocycles', 'mesocycle'))) THEN
          v_out := v_out || jsonb_build_object(v_key, 'null'::jsonb);
        ELSIF jsonb_typeof(v_value) = 'string' AND v_key = 'name'
              AND p_parent IN ('program', 'mesocycle', 'mesocycles', 'sessions') THEN
          v_out := v_out || jsonb_build_object(v_key,
            CASE p_parent WHEN 'program' THEN 'Programa' WHEN 'sessions' THEN 'Sesión' ELSE 'Mesociclo' END);
        ELSE
          v_out := v_out || jsonb_build_object(v_key, app.anonymize_json(v_value, v_key));
        END IF;
      END LOOP;
      RETURN v_out;
    WHEN 'array' THEN
      SELECT coalesce(jsonb_agg(app.anonymize_json(e, p_parent) ORDER BY o), '[]'::jsonb)
        INTO v_out FROM jsonb_array_elements(p_doc) WITH ORDINALITY AS t(e, o);
      RETURN v_out;
    ELSE
      RETURN p_doc;
  END CASE;
END
$$;

-- La supresión. La llama el dueño, en su organización, sobre un paciente archivado. Devuelve las claves de los archivos que marcó
-- borrados, para que la aplicación borre sus bytes después de confirmar.
CREATE FUNCTION clinical.anonymize_patient(p_patient_id uuid) RETURNS SETOF text
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
REVOKE ALL ON FUNCTION clinical.anonymize_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.anonymize_patient(uuid) TO app_user;
REVOKE ALL ON FUNCTION app.anonymize_json(jsonb, text) FROM PUBLIC;

-- Los disparadores de inmutabilidad dejan pasar a la supresión (RN-E15 sigue para todo lo demás).
CREATE OR REPLACE FUNCTION assessment.guard_bia_reading_of_closed_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_evaluation_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.evaluation_id ELSE NEW.evaluation_id END;
  v_status        text;
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT e.status INTO v_status FROM assessment.evaluation e WHERE e.id = v_evaluation_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'La evaluación % no está en borrador: su bioimpedancia no cambia (RN-C07)', v_evaluation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluation_id <> NEW.evaluation_id THEN
    RAISE EXCEPTION 'Una lectura no cambia de evaluación' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION assessment.guard_closed_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'CLOSED' AND NEW.status = 'AMENDED'
     AND (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'version'])
       = (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'version']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La evaluación % está %: no se edita, se enmienda con una revisión (RN-C07)', OLD.id, OLD.status
    USING ERRCODE = 'integrity_constraint_violation';
END $function$;

CREATE OR REPLACE FUNCTION assessment.guard_measurement_of_closed_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_evaluation_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.evaluation_id ELSE NEW.evaluation_id END;
  v_status        text;
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT e.status INTO v_status FROM assessment.evaluation e WHERE e.id = v_evaluation_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'La evaluación % no está en borrador: sus tomas no cambian (RN-C07)', v_evaluation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluation_id <> NEW.evaluation_id THEN
    RAISE EXCEPTION 'Una toma no cambia de evaluación' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION clinical.guard_screening_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.status = 'GREEN' THEN
    RAISE EXCEPTION 'Un cribado en verde no se revisa (RN-F15)' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.review_decision IS NOT NULL THEN
    RAISE EXCEPTION 'Este cribado ya tiene su revisión (RN-F15)' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF app.role() = 'PATIENT' THEN
    RAISE EXCEPTION 'La revisión es del coach (RN-F15)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION nutrition.guard_plan_children()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_row     record;
  v_plan_id uuid;
  v_status  text;
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  IF TG_TABLE_NAME IN ('plan_meal', 'plan_exchange', 'plan_day_profile', 'plan_meal_profile_exchange',
                       'plan_item_profile') THEN
    v_plan_id := v_row.plan_id;
  ELSE
    SELECT plan_id INTO v_plan_id FROM nutrition.plan_meal WHERE id = v_row.plan_meal_id;
    -- Borrar un tiempo de comida borra en cascada lo suyo: su propio disparador ya exigió el borrador.
    IF TG_OP = 'DELETE' AND v_plan_id IS NULL THEN
      RETURN OLD;
    END IF;
  END IF;
  SELECT status INTO v_status FROM nutrition.plan WHERE id = v_plan_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'El plan % está %: sus tiempos, intercambios, alimentos, perfiles y porciones no cambian (RN-E15)',
      v_plan_id, coalesce(v_status, 'sin plan')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION nutrition.guard_published_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status IN ('SUPERSEDED', 'ARCHIVED')
     AND (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'version'])
       = (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'version']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El plan % está %: es inmutable, editarlo crea una versión nueva (RN-E15)', OLD.id, OLD.status
    USING ERRCODE = 'integrity_constraint_violation';
END $function$;

CREATE OR REPLACE FUNCTION training.guard_mesocycle_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF app.role() = 'PATIENT' THEN
      RAISE EXCEPTION 'El informe del mesociclo lo crea el coach (RN-G19)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.status = 'SENT' OR app.role() = 'PATIENT') AND (
       NEW.achievement IS DISTINCT FROM OLD.achievement
    OR NEW.limitation IS DISTINCT FROM OLD.limitation
    OR NEW.adjustment IS DISTINCT FROM OLD.adjustment
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.snapshot_schema_version IS DISTINCT FROM OLD.snapshot_schema_version
    OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.sent_by IS DISTINCT FROM OLD.sent_by) THEN
    RAISE EXCEPTION 'El informe del mesociclo % ya se envió o no es del alumno: no se cambia (RN-G19)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF app.role() IS DISTINCT FROM 'PATIENT' AND (
       NEW.student_comment IS DISTINCT FROM OLD.student_comment
    OR NEW.student_commented_at IS DISTINCT FROM OLD.student_commented_at) THEN
    RAISE EXCEPTION 'El comentario del informe % es del alumno (RN-G19)', OLD.id USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION training.guard_program_children()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_row        record;
  v_program_id uuid;
  v_status     text;
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'mesocycle' THEN
      v_program_id := v_row.program_id;
    WHEN 'program_week' THEN
      SELECT m.program_id INTO v_program_id FROM training.mesocycle m WHERE m.id = v_row.mesocycle_id;
    WHEN 'session' THEN
      SELECT m.program_id INTO v_program_id
      FROM training.program_week w JOIN training.mesocycle m ON m.id = w.mesocycle_id
      WHERE w.id = v_row.week_id;
    WHEN 'prescribed_exercise' THEN
      SELECT m.program_id INTO v_program_id
      FROM training.session s
      JOIN training.program_week w ON w.id = s.week_id
      JOIN training.mesocycle m ON m.id = w.mesocycle_id
      WHERE s.id = v_row.session_id;
    ELSE
      SELECT m.program_id INTO v_program_id
      FROM training.prescribed_exercise e
      JOIN training.session s ON s.id = e.session_id
      JOIN training.program_week w ON w.id = s.week_id
      JOIN training.mesocycle m ON m.id = w.mesocycle_id
      WHERE e.id = v_row.prescribed_exercise_id;
  END CASE;
  IF TG_OP = 'DELETE' AND v_program_id IS NULL THEN
    RETURN OLD;
  END IF;
  SELECT status INTO v_status FROM training.program WHERE id = v_program_id;
  IF TG_OP = 'DELETE' AND v_status IS NULL THEN
    RETURN OLD;
  END IF;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'El programa % está %: sus semanas, sesiones y series no cambian (RN-F12)', v_program_id,
      coalesce(v_status, 'sin programa')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION training.guard_published_program()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status IN ('SUPERSEDED', 'ARCHIVED')
     AND (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'version'])
       = (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'version']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La rutina % está %: es inmutable, editarla crea una versión nueva (RN-F12)', OLD.id, OLD.status
    USING ERRCODE = 'integrity_constraint_violation';
END $function$;

CREATE OR REPLACE FUNCTION training.guard_weekly_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- La supresión (RN-B05, ADR-133) vacía también lo cerrado o publicado: solo ella, como dueña de la base.
  IF app.anonymizing() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.coach_decision IS NOT NULL AND (
       NEW.coach_decision IS DISTINCT FROM OLD.coach_decision
    OR NEW.decided_volume_factor IS DISTINCT FROM OLD.decided_volume_factor
    OR NEW.decision_note IS DISTINCT FROM OLD.decision_note
    OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
    OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
    OR NEW.resulting_program_id IS DISTINCT FROM OLD.resulting_program_id) THEN
    RAISE EXCEPTION 'La decisión del control semanal % ya está tomada', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.coach_decision IS NULL AND NEW.coach_decision IS NOT NULL AND OLD.status <> 'CURRENT' THEN
    RAISE EXCEPTION 'El control semanal % fue reemplazado: no se decide', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'El control semanal % no vuelve a estar vigente', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;
