-- P12 · Programa de entrenamiento: tabla de fases, macrociclo y bloques de la propuesta (RF-26, RN-F12 a RN-F14; 07 §6 y §7,
-- ADR-077).

CREATE TABLE training.periodization_phase (           -- fases por objetivo y semana, versionadas (RN-F13, 07 §7)
  id              uuid PRIMARY KEY,
  organization_id uuid,                               -- NULL = tabla de la V3
  objective       text NOT NULL CHECK (objective IN ('FAT_LOSS','HYPERTROPHY','STRENGTH','HEALTH')),
  valid_from      date NOT NULL,                      -- la versión: el programa guarda la que usó
  week_no         smallint NOT NULL CHECK (week_no BETWEEN 1 AND 12),
  phase_es        text NOT NULL,                      -- 'Acumulación'
  phase_goal_es   text NOT NULL,                      -- 'Sostener volumen'
  volume_factor   numeric(4,2) NOT NULL CHECK (volume_factor > 0 AND volume_factor <= 2),
  intensity       text NOT NULL CHECK (intensity IN ('LOW','LOW_MODERATE','MODERATE','MODERATE_HIGH','HIGH','VERY_HIGH')),
  target_rir      smallint NOT NULL CHECK (target_rir BETWEEN 0 AND 5),
  is_deload       boolean NOT NULL DEFAULT false,     -- las semanas «Descarga»
  review_kind     text NOT NULL CHECK (review_kind IN ('DAILY','CONTROL')),  -- «Seguimiento diario» o «Control y ajuste» (semanas 4, 8 y 12)
  UNIQUE NULLS NOT DISTINCT (organization_id, objective, valid_from, week_no)
);

-- La tabla de la V3 (seeds/training/periodization-v3.json; una prueba comprueba que coinciden).
INSERT INTO training.periodization_phase
  (id, organization_id, valid_from, objective, week_no, phase_es, phase_goal_es, volume_factor, intensity, target_rir, is_deload, review_kind)
SELECT gen_random_uuid(), NULL, DATE '2026-10-15', p.*
FROM (VALUES
  ('FAT_LOSS', 1, 'Adaptación', 'Técnica y tolerancia', 0.75, 'MODERATE', 3, false, 'DAILY'),
  ('FAT_LOSS', 2, 'Base', 'Acumular trabajo', 0.90, 'MODERATE', 3, false, 'DAILY'),
  ('FAT_LOSS', 3, 'Acumulación', 'Sostener volumen', 1.00, 'MODERATE', 2, false, 'DAILY'),
  ('FAT_LOSS', 4, 'Acumulación', 'Progresar', 1.05, 'MODERATE_HIGH', 2, false, 'CONTROL'),
  ('FAT_LOSS', 5, 'Descarga', 'Reducir fatiga', 0.70, 'LOW_MODERATE', 4, true, 'DAILY'),
  ('FAT_LOSS', 6, 'Intensificación', 'Mantener fuerza', 0.95, 'HIGH', 2, false, 'DAILY'),
  ('FAT_LOSS', 7, 'Intensificación', 'Progresar cargas', 1.00, 'HIGH', 2, false, 'DAILY'),
  ('FAT_LOSS', 8, 'Acumulación', 'Gasto y volumen', 1.05, 'MODERATE', 2, false, 'CONTROL'),
  ('FAT_LOSS', 9, 'Descarga', 'Recuperar', 0.70, 'LOW_MODERATE', 4, true, 'DAILY'),
  ('FAT_LOSS', 10, 'Consolidación', 'Sostener rendimiento', 1.00, 'MODERATE_HIGH', 2, false, 'DAILY'),
  ('FAT_LOSS', 11, 'Consolidación', 'Cerrar bloque', 1.00, 'MODERATE_HIGH', 2, false, 'DAILY'),
  ('FAT_LOSS', 12, 'Transición / retest', 'Evaluar y planificar', 0.60, 'LOW', 4, false, 'CONTROL'),
  ('HYPERTROPHY', 1, 'Adaptación', 'Técnica y base', 0.75, 'MODERATE', 3, false, 'DAILY'),
  ('HYPERTROPHY', 2, 'Acumulación', 'Volumen tolerable', 0.90, 'MODERATE', 3, false, 'DAILY'),
  ('HYPERTROPHY', 3, 'Hipertrofia', 'Progresar volumen', 1.00, 'MODERATE', 2, false, 'DAILY'),
  ('HYPERTROPHY', 4, 'Hipertrofia', 'Sobrecarga', 1.10, 'MODERATE_HIGH', 1, false, 'CONTROL'),
  ('HYPERTROPHY', 5, 'Descarga', 'Disipar fatiga', 0.65, 'LOW_MODERATE', 4, true, 'DAILY'),
  ('HYPERTROPHY', 6, 'Hipertrofia II', 'Retomar volumen', 0.95, 'MODERATE', 3, false, 'DAILY'),
  ('HYPERTROPHY', 7, 'Hipertrofia II', 'Progresar', 1.05, 'MODERATE_HIGH', 2, false, 'DAILY'),
  ('HYPERTROPHY', 8, 'Intensificación', 'Más carga', 1.00, 'HIGH', 1, false, 'CONTROL'),
  ('HYPERTROPHY', 9, 'Descarga', 'Recuperar', 0.65, 'LOW_MODERATE', 4, true, 'DAILY'),
  ('HYPERTROPHY', 10, 'Realización', 'Sobrecarga controlada', 1.00, 'HIGH', 1, false, 'DAILY'),
  ('HYPERTROPHY', 11, 'Realización', 'Cerrar bloque', 1.05, 'HIGH', 1, false, 'DAILY'),
  ('HYPERTROPHY', 12, 'Transición / retest', 'Evaluar y planificar', 0.60, 'LOW', 4, false, 'CONTROL'),
  ('STRENGTH', 1, 'Adaptación', 'Técnica de básicos', 0.70, 'MODERATE', 4, false, 'DAILY'),
  ('STRENGTH', 2, 'Base', 'Volumen de fuerza', 0.85, 'MODERATE', 3, false, 'DAILY'),
  ('STRENGTH', 3, 'Acumulación', 'Construir trabajo', 1.00, 'MODERATE_HIGH', 3, false, 'DAILY'),
  ('STRENGTH', 4, 'Acumulación', 'Progresar carga', 1.05, 'HIGH', 2, false, 'CONTROL'),
  ('STRENGTH', 5, 'Descarga', 'Disipar fatiga', 0.65, 'LOW', 4, true, 'DAILY'),
  ('STRENGTH', 6, 'Intensificación', 'Fuerza específica', 0.90, 'HIGH', 2, false, 'DAILY'),
  ('STRENGTH', 7, 'Intensificación', 'Fuerza específica', 0.90, 'HIGH', 2, false, 'DAILY'),
  ('STRENGTH', 8, 'Realización', 'Cargas altas', 0.80, 'VERY_HIGH', 1, false, 'CONTROL'),
  ('STRENGTH', 9, 'Descarga', 'Recuperar', 0.55, 'LOW', 4, true, 'DAILY'),
  ('STRENGTH', 10, 'Puesta a punto', 'Bajo volumen', 0.65, 'VERY_HIGH', 1, false, 'DAILY'),
  ('STRENGTH', 11, 'Evaluación', 'Estimación / prueba', 0.50, 'VERY_HIGH', 1, false, 'DAILY'),
  ('STRENGTH', 12, 'Transición', 'Recuperar y revisar', 0.50, 'LOW', 4, false, 'CONTROL'),
  ('HEALTH', 1, 'Adaptación', 'Adherencia y técnica', 0.65, 'LOW_MODERATE', 4, false, 'DAILY'),
  ('HEALTH', 2, 'Adaptación', 'Tolerancia', 0.75, 'MODERATE', 4, false, 'DAILY'),
  ('HEALTH', 3, 'Base', 'Capacidad general', 0.85, 'MODERATE', 3, false, 'DAILY'),
  ('HEALTH', 4, 'Base', 'Progresión', 0.95, 'MODERATE', 3, false, 'CONTROL'),
  ('HEALTH', 5, 'Descarga', 'Recuperar', 0.65, 'LOW', 4, true, 'DAILY'),
  ('HEALTH', 6, 'Desarrollo', 'Fuerza y capacidad', 0.90, 'MODERATE', 3, false, 'DAILY'),
  ('HEALTH', 7, 'Desarrollo', 'Progresar', 1.00, 'MODERATE', 2, false, 'DAILY'),
  ('HEALTH', 8, 'Desarrollo', 'Consolidar', 1.00, 'MODERATE_HIGH', 2, false, 'CONTROL'),
  ('HEALTH', 9, 'Descarga', 'Recuperar', 0.65, 'LOW', 4, true, 'DAILY'),
  ('HEALTH', 10, 'Consolidación', 'Mantener progreso', 0.95, 'MODERATE', 3, false, 'DAILY'),
  ('HEALTH', 11, 'Consolidación', 'Cerrar bloque', 1.00, 'MODERATE', 2, false, 'DAILY'),
  ('HEALTH', 12, 'Retest / transición', 'Evaluar y planificar', 0.60, 'LOW', 4, false, 'CONTROL')
) AS p(objective, week_no, phase_es, phase_goal_es, volume_factor, intensity, target_rir, is_deload, review_kind);

ALTER TABLE training.program                          -- macrociclo de la V3 (07 §6 y §7)
  ADD COLUMN objective                text CHECK (objective IN ('FAT_LOSS','HYPERTROPHY','STRENGTH','HEALTH')),
  ADD COLUMN level                    text CHECK (level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
  ADD COLUMN days_per_week            smallint CHECK (days_per_week BETWEEN 2 AND 5),
  ADD COLUMN split                    text CHECK (split IN ('FULL_BODY','FULL_BODY_ABC','UPPER_LOWER','PUSH_PULL_LEGS')),
  ADD COLUMN macrocycle_weeks         smallint CHECK (macrocycle_weeks BETWEEN 8 AND 12),
  ADD COLUMN periodization_valid_from date,           -- versión de la tabla de fases que usó (RN-F13)
  ADD COLUMN template_version         text,           -- versión de la plantilla de bloques que usó (RN-F14)
  ADD COLUMN athlete_profile_id       uuid REFERENCES training.athlete_profile(id),
  ADD COLUMN origin                   text NOT NULL DEFAULT 'MANUAL' CHECK (origin IN ('MANUAL','PROPOSAL')),
  ADD CONSTRAINT program_published_has_snapshot CHECK (
    status = 'DRAFT'
    OR (snapshot IS NOT NULL AND snapshot_schema_version IS NOT NULL AND snapshot_hash IS NOT NULL
        AND published_at IS NOT NULL AND published_by IS NOT NULL)
  );

-- Una rutina tiene a lo más un borrador a la vez: una versión nueva parte de la publicada.
CREATE UNIQUE INDEX program_one_draft ON training.program (lineage_id) WHERE status = 'DRAFT';

ALTER TABLE training.program_week                     -- semana del macrociclo (07 §7); is_deload ya existe
  ADD COLUMN phase_es      text,
  ADD COLUMN phase_goal_es text,
  ADD COLUMN volume_factor numeric(4,2) CHECK (volume_factor > 0 AND volume_factor <= 2),
  ADD COLUMN intensity     text CHECK (intensity IN ('LOW','LOW_MODERATE','MODERATE','MODERATE_HIGH','HIGH','VERY_HIGH')),
  ADD COLUMN target_rir    smallint CHECK (target_rir BETWEEN 0 AND 5),
  ADD COLUMN review_kind   text CHECK (review_kind IN ('DAILY','CONTROL'));

ALTER TABLE training.prescribed_exercise              -- bloque de la propuesta (07 §6)
  ADD COLUMN movement_pattern      text REFERENCES exercise.movement_pattern(code),
  ADD COLUMN suggested_exercise_id uuid,              -- el de la tabla patrón × nivel; exercise_id es el aprobado
  ADD COLUMN substitution_note     text,
  ADD COLUMN approved_by           uuid,              -- miembro
  ADD COLUMN approved_at           timestamptz,
  ADD CONSTRAINT prescribed_exercise_approved_together CHECK ((approved_by IS NULL) = (approved_at IS NULL));

CREATE INDEX mesocycle_of_program ON training.mesocycle (program_id, position);
CREATE INDEX session_of_week ON training.session (week_id, position);
CREATE INDEX prescribed_exercise_of_session ON training.prescribed_exercise (session_id, position);

-- Hijos de un programa ------------------------------------------------------------------------------
-- Solo se insertan, cambian o borran mientras su programa está en DRAFT (RN-F12): la base lo rechaza aunque alguien se salte la
-- API. Borrar un hijo borra en cascada lo suyo, y su propio disparador ya exigió el borrador.
CREATE FUNCTION training.guard_program_children() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_row        record;
  v_program_id uuid;
  v_status     text;
BEGIN
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
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mesocycle', 'program_week', 'session', 'prescribed_exercise', 'prescribed_set'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON training.%I
                      FOR EACH ROW EXECUTE FUNCTION training.guard_program_children()', t || '_only_in_draft', t);
  END LOOP;
END $$;

-- RLS ----------------------------------------------------------------------------------------------
SELECT app.enable_catalog_rls('training.periodization_phase');
SELECT app.restrict_patient('training.periodization_phase');
