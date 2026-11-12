-- P14.5 (PR 7a) · El informe de cada mesociclo (P-28 y P-29, respuestas de Rodrigo del 2026-11-10 y del 2026-11-11; RN-G19;
-- ADR-117): uno por mesociclo de la línea del programa. El coach escribe el logro, la limitante, el ajuste y la prioridad en el
-- borrador y lo envía cuando cierra la última semana del mesociclo. Enviarlo congela los números (MESOCYCLE_REPORT_JV), el resumen
-- del control semanal y la comparativa física (RN-D01, RN-D08). Después solo cambia el comentario del alumno, que lo escribe desde
-- su app y solo ve los informes enviados. Fuera del contrato: cotización de la fase C por la cláusula décimo segunda.
CREATE TABLE training.mesocycle_report (
  id                      uuid PRIMARY KEY,
  organization_id         uuid NOT NULL,
  patient_id              uuid NOT NULL,
  program_lineage_id      uuid NOT NULL,                 -- training.program.lineage_id: las versiones conservan los mesociclos
  mesocycle_position      smallint NOT NULL CHECK (mesocycle_position >= 1),
  status                  text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT')),
  achievement             text CHECK (length(achievement) <= 1000),   -- «Logro principal»
  limitation              text CHECK (length(limitation) <= 1000),    -- «Limitante»
  adjustment              text CHECK (length(adjustment) <= 1000),    -- «Ajuste principal»
  priority                text CHECK (length(priority) <= 1000),      -- «Prioridad siguiente»
  student_comment         text CHECK (length(student_comment) <= 1000),
  student_commented_at    timestamptz,
  snapshot                jsonb,                         -- lo que congeló enviarlo, con su método y versión
  snapshot_schema_version smallint,
  snapshot_hash           bytea,
  sent_at                 timestamptz,
  sent_by                 uuid,                          -- miembro
  created_by              uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 int NOT NULL DEFAULT 0,
  CHECK ((status = 'SENT') = (snapshot IS NOT NULL)),
  CHECK ((snapshot IS NULL) = (snapshot_schema_version IS NULL) AND (snapshot IS NULL) = (snapshot_hash IS NULL)),
  CHECK ((snapshot IS NULL) = (sent_at IS NULL) AND (sent_at IS NULL) = (sent_by IS NULL)),
  -- Enviado, con los cuatro textos (RN-G19).
  CHECK (status = 'DRAFT' OR (achievement IS NOT NULL AND limitation IS NOT NULL AND adjustment IS NOT NULL AND priority IS NOT NULL)),
  -- El alumno comenta lo enviado.
  CHECK (student_comment IS NULL OR status = 'SENT'),
  CHECK ((student_comment IS NULL) = (student_commented_at IS NULL)),
  UNIQUE (program_lineage_id, mesocycle_position)
);
CREATE INDEX mesocycle_report_by_patient ON training.mesocycle_report (organization_id, patient_id, program_lineage_id);

SELECT app.enable_tenant_rls('training.mesocycle_report');
SELECT app.restrict_platform_admin('training.mesocycle_report');
SELECT app.enable_care_team_scope('training.mesocycle_report');
SELECT app.restrict_account('training.mesocycle_report');
-- El alumno ve sus informes enviados y escribe su comentario; nunca un borrador.
SELECT app.restrict_patient(
  'training.mesocycle_report',
  'patient_id = app.patient_id() AND status = ''SENT''',
  'patient_id = app.patient_id() AND status = ''SENT'''
);

REVOKE UPDATE ON training.mesocycle_report FROM app_user;
GRANT UPDATE (achievement, limitation, adjustment, priority, status, snapshot, snapshot_schema_version, snapshot_hash, sent_at,
              sent_by, student_comment, student_commented_at, updated_at, version)
  ON training.mesocycle_report TO app_user;

-- Enviado es final: solo cambian el comentario del alumno y la versión (RN-G19, RN-D08). El alumno no crea informes ni cambia lo
-- del coach.
CREATE FUNCTION training.guard_mesocycle_report() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
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
END $$;

CREATE TRIGGER mesocycle_report_guard BEFORE INSERT OR UPDATE ON training.mesocycle_report
  FOR EACH ROW EXECUTE FUNCTION training.guard_mesocycle_report();
