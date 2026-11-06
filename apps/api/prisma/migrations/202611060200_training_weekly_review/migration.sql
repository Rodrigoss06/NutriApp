-- P14 (PR 3) · El control semanal del macrociclo y la decisión del coach (RF-42, RN-G16, RN-F17; 07 §10; 05.2; ADR-089).

CREATE TABLE training.weekly_review (
  id                      uuid PRIMARY KEY,
  organization_id         uuid NOT NULL,
  patient_id              uuid NOT NULL,
  program_id              uuid NOT NULL REFERENCES training.program(id),  -- la versión publicada evaluada
  week_no                 smallint NOT NULL,
  week_start              date NOT NULL,
  week_end                date NOT NULL,
  method_code             text NOT NULL,              -- 'WEEKLY_REVIEW_JV'
  method_version          text NOT NULL,              -- semver del registro del motor (ADR-086)
  engine_version          text NOT NULL,
  threshold_id            uuid NOT NULL,
  inputs                  jsonb NOT NULL,             -- los días de la semana, el factor del plan y los umbrales (07 §10)
  inputs_hash             bytea NOT NULL,
  light                   text NOT NULL CHECK (light IN ('GREEN','AMBER','RED','NO_DATA')),
  planned_volume_factor   numeric(4,2) NOT NULL,
  -- 3 decimales: el factor ajustado de G-39 es 0.825 (05.2 lo tenía en 2). Se redondea al presentar (RN-D09).
  suggested_volume_factor numeric(5,3),
  suggested_action        text NOT NULL CHECK (suggested_action IN ('CONTINUE','ADJUST','DELOAD','MISSING_LOG')),
  computed_at             timestamptz NOT NULL,
  coach_decision          text CHECK (coach_decision IN ('KEEP','ADJUST','DELOAD')),
  decided_volume_factor   numeric(4,2) CHECK (decided_volume_factor > 0 AND decided_volume_factor <= 2),
  decision_note           text CHECK (length(decision_note) <= 1000),
  decided_by              uuid,                       -- miembro
  decided_at              timestamptz,
  resulting_program_id    uuid,                       -- la versión nueva que creó la decisión (borrador hasta publicarse)
  status                  text NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','SUPERSEDED')),
  CHECK ((coach_decision IS NULL) = (decided_by IS NULL) AND (decided_by IS NULL) = (decided_at IS NULL)),
  CHECK (coach_decision IS NULL OR decision_note IS NOT NULL),  -- RN-F17: con nota
  UNIQUE (program_id, week_no, inputs_hash)
);
CREATE UNIQUE INDEX weekly_review_current ON training.weekly_review (program_id, week_no) WHERE status = 'CURRENT';
CREATE INDEX weekly_review_by_patient ON training.weekly_review (organization_id, patient_id, week_start DESC);

SELECT app.enable_tenant_rls('training.weekly_review');
SELECT app.restrict_platform_admin('training.weekly_review');
SELECT app.enable_care_team_scope('training.weekly_review');
SELECT app.restrict_account('training.weekly_review');
SELECT app.restrict_patient('training.weekly_review');

-- UPDATE solo de la decisión, una vez y con el control vigente, y del estado, que solo pasa a SUPERSEDED (05.2). Un registro tardío
-- crea un control nuevo y el anterior queda reemplazado con su decisión.
REVOKE UPDATE ON training.weekly_review FROM app_user;
GRANT UPDATE (coach_decision, decided_volume_factor, decision_note, decided_by, decided_at, resulting_program_id, status)
  ON training.weekly_review TO app_user;

CREATE FUNCTION training.guard_weekly_review() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
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
END $$;

CREATE TRIGGER weekly_review_guard BEFORE UPDATE ON training.weekly_review
  FOR EACH ROW EXECUTE FUNCTION training.guard_weekly_review();
