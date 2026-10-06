-- 0008 · training (Notion 05.2). El paciente no ve nada aquí: lee la rutina publicada desde
-- tracking.active_plan_view.

CREATE TABLE training.program (
  id                      uuid PRIMARY KEY,
  organization_id         uuid NOT NULL,
  patient_id              uuid NOT NULL,
  lineage_id              uuid NOT NULL,
  version_no              int NOT NULL,
  name                    text NOT NULL,
  goal                    text,
  status                  text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED','ARCHIVED')),
  start_date              date,
  end_date                date,
  one_rm_formula          text NOT NULL DEFAULT 'ONERM_EPLEY1985',
  published_at            timestamptz,
  published_by            uuid,
  snapshot                jsonb,                      -- incluye los músculos de cada ejercicio (RN-F12)
  snapshot_schema_version smallint,
  snapshot_hash           bytea,
  created_by              uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 int NOT NULL DEFAULT 0,
  UNIQUE (lineage_id, version_no)
);
CREATE UNIQUE INDEX program_one_published ON training.program (patient_id) WHERE status = 'PUBLISHED';

CREATE TABLE training.mesocycle (
  id uuid PRIMARY KEY, program_id uuid NOT NULL REFERENCES training.program(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL, position smallint NOT NULL, name text NOT NULL, focus text,
  weeks smallint NOT NULL CHECK (weeks BETWEEN 1 AND 12)
);
CREATE TABLE training.program_week (
  id uuid PRIMARY KEY, mesocycle_id uuid NOT NULL REFERENCES training.mesocycle(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL, week_no smallint NOT NULL, is_deload boolean NOT NULL DEFAULT false,
  UNIQUE (mesocycle_id, week_no)
);
CREATE TABLE training.session (
  id uuid PRIMARY KEY, week_id uuid NOT NULL REFERENCES training.program_week(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL, position smallint NOT NULL, name text NOT NULL,
  day_of_week smallint CHECK (day_of_week BETWEEN 1 AND 7), notes text
);
CREATE TABLE training.prescribed_exercise (
  id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES training.session(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL, exercise_id uuid NOT NULL, position smallint NOT NULL,
  superset_group text, notes text
);
CREATE TABLE training.prescribed_set (
  id                     uuid PRIMARY KEY,
  prescribed_exercise_id uuid NOT NULL REFERENCES training.prescribed_exercise(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL,
  set_no                 smallint NOT NULL,
  set_type               text NOT NULL DEFAULT 'WORKING' CHECK (set_type IN ('WARMUP','WORKING','DROP','AMRAP','BACKOFF')),
  reps_min               smallint,
  reps_max               smallint,
  load_kind              text CHECK (load_kind IN ('KG','PCT_1RM','RPE','RIR','BODYWEIGHT')),
  load_value             numeric(6,2),
  rest_seconds           smallint,
  tempo                  text,
  duration_seconds       int,                        -- cardio
  distance_m             numeric(8,1),
  met                    numeric(4,1),
  CHECK (reps_min IS NULL OR reps_max IS NULL OR reps_min <= reps_max),
  UNIQUE (prescribed_exercise_id, set_no)
);

-- Inmutabilidad (RN-F12) ---------------------------------------------------------------------------
-- Igual que el plan nutricional: publicada, la rutina solo pasa a SUPERSEDED o ARCHIVED.
CREATE FUNCTION training.guard_published_program() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
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
END $$;

CREATE TRIGGER program_immutable_when_published
  BEFORE UPDATE ON training.program
  FOR EACH ROW EXECUTE FUNCTION training.guard_published_program();

-- RLS ----------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['training.program', 'training.mesocycle', 'training.program_week',
                           'training.session', 'training.prescribed_exercise',
                           'training.prescribed_set'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
    PERFORM app.restrict_patient(t::regclass);
    PERFORM app.restrict_platform_admin(t::regclass);
  END LOOP;
END $$;

-- Permisos -----------------------------------------------------------------------------------------
-- Estructura de una rutina en borrador: se reemplaza al editarla.
GRANT DELETE ON training.mesocycle, training.program_week, training.session,
  training.prescribed_exercise, training.prescribed_set TO app_user;
