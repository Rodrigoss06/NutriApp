-- P12 · Seguridad antes de prescribir (RF-41, RN-F15; 07 §2 a §4, ADR-075): perfil de entrenamiento, cribado con la revisión
-- del coach, evaluación postural y pruebas físicas. La anticoncepción hormonal del perfil llega con MENSTRUAL_TRACKING (P13).

CREATE TABLE training.athlete_profile (               -- perfil de entrenamiento (07 §2); cada cambio es una revisión nueva
  id                      uuid PRIMARY KEY,
  organization_id         uuid NOT NULL,
  patient_id              uuid NOT NULL,
  revision                int NOT NULL,
  objective               text NOT NULL CHECK (objective IN ('FAT_LOSS','HYPERTROPHY','STRENGTH','HEALTH')),  -- P-01
  level                   text NOT NULL CHECK (level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
  days_per_week           smallint NOT NULL CHECK (days_per_week BETWEEN 2 AND 5),
  minutes_per_session     smallint CHECK (minutes_per_session BETWEEN 30 AND 120),  -- informativo (P-05)
  equipment_codes         text[] NOT NULL DEFAULT '{}',  -- exercise.equipment
  start_date              date,
  macrocycle_weeks        smallint NOT NULL DEFAULT 12 CHECK (macrocycle_weeks BETWEEN 8 AND 12),
  medical_clearance       text NOT NULL DEFAULT 'PENDING' CHECK (medical_clearance IN ('PENDING','CLEARED','NOT_REQUIRED')),
  alarm_symptoms          boolean NOT NULL DEFAULT false,  -- síntomas neurológicos o mareos que registra el coach: bloquean como el dolor (07 §3.3)
  injuries_note           text,                       -- sin diagnóstico
  restrictions_note       text,                       -- movimientos o cargas
  baseline_weight_kg      numeric(5,2),
  baseline_resting_hr_bpm smallint CHECK (baseline_resting_hr_bpm BETWEEN 25 AND 220),
  baseline_hrv_ms         numeric(5,1) CHECK (baseline_hrv_ms > 0),
  sleep_target_hours      numeric(3,1) NOT NULL DEFAULT 8 CHECK (sleep_target_hours BETWEEN 4 AND 12),
  test_targets            jsonb NOT NULL DEFAULT '{}', -- {código de prueba física: valor objetivo} (07 §4)
  notes                   text,
  recorded_by             uuid NOT NULL,
  recorded_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, revision)
);

CREATE TABLE clinical.pre_exercise_screening (        -- cribado V2 (RN-F15, 07 §3.2); cada respuesta es una fila nueva
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL REFERENCES clinical.patient(id),
  form_version    text NOT NULL,                      -- 'JV_SCREENING_V2'
  answers         jsonb NOT NULL,                     -- {S01..S08: true o false, S09: texto}
  status          text NOT NULL CHECK (status IN ('GREEN','AMBER','RED')),
  rule_version    text NOT NULL,
  answered_by     uuid NOT NULL,                      -- usuario: un miembro; el paciente desde la app cuando llegue (P13)
  answered_at     timestamptz NOT NULL DEFAULT now(),
  review_decision text CHECK (review_decision IN ('START','LIMIT','REFER')),  -- iniciar, limitar o derivar
  review_note     text,
  reviewed_by     uuid,                               -- miembro
  reviewed_at     timestamptz,
  CHECK ((review_decision IS NULL) = (reviewed_by IS NULL) AND (reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK (review_decision IS NULL OR review_note IS NOT NULL)
);
CREATE INDEX screening_by_patient ON clinical.pre_exercise_screening (organization_id, patient_id, answered_at DESC);

-- La revisión se escribe una vez, solo en rojo o ámbar y nunca como paciente: quien responde no se revisa a sí mismo.
CREATE FUNCTION clinical.guard_screening_review() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
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
END $$;

CREATE TRIGGER screening_review_once
  BEFORE UPDATE ON clinical.pre_exercise_screening
  FOR EACH ROW EXECUTE FUNCTION clinical.guard_screening_review();

-- La postura y las pruebas físicas son evaluaciones: heredan evaluador, fecha, cierre y enmienda (RN-D08).
ALTER TABLE assessment.evaluation
  DROP CONSTRAINT evaluation_kind_check,
  ADD CONSTRAINT evaluation_kind_check CHECK (kind IN ('ANTHROPOMETRY','BIA','MIXED','MOVEMENT','FITNESS')),
  ADD COLUMN moment text CHECK (moment IN ('BASELINE','WEEK_4','WEEK_8','WEEK_12','RETEST')),  -- solo FITNESS (07 §4)
  ADD CONSTRAINT evaluation_moment_only_fitness CHECK ((kind = 'FITNESS') = (moment IS NOT NULL));

CREATE TABLE assessment.movement_test (               -- global: las 14 pruebas de postura y movimiento (07 §3.3)
  code          text PRIMARY KEY,
  name_es       text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('STATIC','DYNAMIC')),
  region_es     text NOT NULL,
  display_order smallint NOT NULL
);

INSERT INTO assessment.movement_test (code, name_es, kind, region_es, display_order) VALUES
  ('HEAD_NECK', 'Cabeza y cervical', 'STATIC', 'Cervical', 1),
  ('SHOULDERS', 'Hombros', 'STATIC', 'Cintura escapular', 2),
  ('SCAPULAE', 'Escápulas', 'STATIC', 'Escápula', 3),
  ('THORACIC_SPINE', 'Columna torácica', 'STATIC', 'Torácica', 4),
  ('PELVIS', 'Pelvis', 'STATIC', 'Lumbopélvica', 5),
  ('KNEES', 'Rodillas', 'STATIC', 'Rodilla', 6),
  ('FEET', 'Pies', 'STATIC', 'Tobillo y pie', 7),
  ('OVERHEAD_SQUAT', 'Sentadilla sobre cabeza', 'DYNAMIC', 'Global', 8),
  ('SINGLE_LEG_SQUAT', 'Sentadilla unipodal', 'DYNAMIC', 'Miembro inferior', 9),
  ('HIP_HINGE', 'Bisagra de cadera', 'DYNAMIC', 'Cadera y columna', 10),
  ('LUNGE', 'Zancada', 'DYNAMIC', 'Miembro inferior', 11),
  ('PUSH', 'Empuje', 'DYNAMIC', 'Hombro y escápula', 12),
  ('PULL', 'Tracción', 'DYNAMIC', 'Hombro y escápula', 13),
  ('PLANK', 'Plancha', 'DYNAMIC', 'Tronco', 14);

CREATE TABLE assessment.physical_test (               -- global: las 15 pruebas físicas (07 §4); cada lado es una prueba
  code          text PRIMARY KEY,
  domain        text NOT NULL CHECK (domain IN ('MOBILITY','MUSCULAR_ENDURANCE','CORE','STRENGTH','POWER','AEROBIC','PERFORMANCE')),
  name_es       text NOT NULL,
  protocol_es   text NOT NULL,
  unit          text NOT NULL,                        -- cm, grados, repeticiones, s, kg, m
  display_order smallint NOT NULL
);

INSERT INTO assessment.physical_test (code, domain, name_es, protocol_es, unit, display_order) VALUES
  ('KNEE_TO_WALL_R', 'MOBILITY', 'Rodilla a pared derecha', 'Talón apoyado', 'cm', 1),
  ('KNEE_TO_WALL_L', 'MOBILITY', 'Rodilla a pared izquierda', 'Talón apoyado', 'cm', 2),
  ('SHOULDER_FLEXION_R', 'MOBILITY', 'Flexión de hombro derecha', 'Pared, compensación controlada', 'grados', 3),
  ('SHOULDER_FLEXION_L', 'MOBILITY', 'Flexión de hombro izquierda', 'Pared, compensación controlada', 'grados', 4),
  ('PUSH_UPS', 'MUSCULAR_ENDURANCE', 'Flexiones', 'Repeticiones técnicas', 'repeticiones', 5),
  ('SIT_TO_STAND_30S', 'MUSCULAR_ENDURANCE', 'Sentarse y levantarse 30 s', 'Altura de banco constante', 'repeticiones', 6),
  ('FRONT_PLANK', 'CORE', 'Plancha frontal', 'Técnica mantenida', 's', 7),
  ('GRIP_R', 'STRENGTH', 'Prensión derecha', 'Mismo dinamómetro', 'kg', 8),
  ('GRIP_L', 'STRENGTH', 'Prensión izquierda', 'Mismo dinamómetro', 'kg', 9),
  ('VERTICAL_JUMP', 'POWER', 'Salto vertical', 'Mismo protocolo', 'cm', 10),
  ('HORIZONTAL_JUMP', 'POWER', 'Salto horizontal', 'Mismo protocolo', 'cm', 11),
  ('WALK_6MIN', 'AEROBIC', 'Caminata de 6 minutos', 'Superficie constante', 'm', 12),
  ('SQUAT_E1RM', 'PERFORMANCE', 'Sentadilla 1RM estimado', 'Submáximo, técnica válida', 'kg', 13),
  ('PRESS_E1RM', 'PERFORMANCE', 'Press 1RM estimado', 'Submáximo, técnica válida', 'kg', 14),
  ('PULL_E1RM', 'PERFORMANCE', 'Tracción 1RM estimado', 'Submáximo, técnica válida', 'kg', 15);

CREATE TABLE assessment.movement_screen (             -- una fila por prueba de una evaluación MOVEMENT (07 §3.3)
  evaluation_id    uuid NOT NULL REFERENCES assessment.evaluation(id),
  test_code        text NOT NULL REFERENCES assessment.movement_test(code),
  organization_id  uuid NOT NULL,
  patient_id       uuid NOT NULL,
  right_score      smallint CHECK (right_score BETWEEN 0 AND 2),
  left_score       smallint CHECK (left_score BETWEEN 0 AND 2),
  pain             boolean NOT NULL DEFAULT false,
  asymmetry        boolean NOT NULL DEFAULT false,
  status           text NOT NULL CHECK (status IN ('PENDING','REFER','MODIFY','CAUTION','FIT')),  -- precedencia de la V3 y P-14
  rule_version     text NOT NULL,
  modality         text NOT NULL DEFAULT 'IN_PERSON' CHECK (modality IN ('IN_PERSON','ONLINE','HYBRID')),
  observation      text,
  action_note      text,                              -- acción o restricción
  reliability_note text,                              -- confiabilidad, texto libre en la V3
  evidence_file_id uuid,                              -- archivo por la API (ADR-038)
  evidence_url     text CHECK (evidence_url ~ '^https://'),  -- enlace a una carpeta restringida (07 §4)
  PRIMARY KEY (evaluation_id, test_code)
);

CREATE TABLE assessment.physical_test_result (        -- una fila por prueba de una evaluación FITNESS (07 §4)
  evaluation_id    uuid NOT NULL REFERENCES assessment.evaluation(id),
  test_code        text NOT NULL REFERENCES assessment.physical_test(code),
  organization_id  uuid NOT NULL,
  patient_id       uuid NOT NULL,
  value            numeric(8,2) NOT NULL,
  unit             text NOT NULL,                     -- copia de la del catálogo
  modality         text NOT NULL DEFAULT 'IN_PERSON' CHECK (modality IN ('IN_PERSON','ONLINE','HYBRID')),
  notes            text,                              -- observación, material y seguridad
  evidence_file_id uuid,
  evidence_url     text CHECK (evidence_url ~ '^https://'),
  PRIMARY KEY (evaluation_id, test_code)
);

-- Como las tomas, solo cambian mientras la evaluación está en borrador (RN-D08).
CREATE TRIGGER movement_screen_only_in_draft
  BEFORE INSERT OR UPDATE OR DELETE ON assessment.movement_screen
  FOR EACH ROW EXECUTE FUNCTION assessment.guard_measurement_of_closed_evaluation();
CREATE TRIGGER physical_test_result_only_in_draft
  BEFORE INSERT OR UPDATE OR DELETE ON assessment.physical_test_result
  FOR EACH ROW EXECUTE FUNCTION assessment.guard_measurement_of_closed_evaluation();

-- RLS ----------------------------------------------------------------------------------------------
SELECT app.enable_global_rls('assessment.movement_test');
SELECT app.enable_global_rls('assessment.physical_test');

SELECT app.enable_tenant_rls(t)
FROM unnest(ARRAY[
  'training.athlete_profile', 'clinical.pre_exercise_screening',
  'assessment.movement_screen', 'assessment.physical_test_result'
]::regclass[]) AS t;
SELECT app.enable_care_team_scope(t)
FROM unnest(ARRAY[
  'training.athlete_profile', 'clinical.pre_exercise_screening',
  'assessment.movement_screen', 'assessment.physical_test_result'
]::regclass[]) AS t;
SELECT app.restrict_account(t)
FROM unnest(ARRAY[
  'training.athlete_profile', 'clinical.pre_exercise_screening',
  'assessment.movement_screen', 'assessment.physical_test_result'
]::regclass[]) AS t;
SELECT app.restrict_platform_admin(t)
FROM unnest(ARRAY[
  'training.athlete_profile', 'clinical.pre_exercise_screening',
  'assessment.movement_screen', 'assessment.physical_test_result'
]::regclass[]) AS t;

SELECT app.restrict_patient('training.athlete_profile');
SELECT app.restrict_patient('assessment.movement_screen');
SELECT app.restrict_patient('assessment.physical_test_result');
-- El paciente responderá su cribado desde la app; la revisión no es suya (disparador).
SELECT app.restrict_patient('clinical.pre_exercise_screening', 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');

-- Permisos -----------------------------------------------------------------------------------------
-- Cada cambio del perfil es una revisión nueva.
REVOKE UPDATE ON training.athlete_profile FROM app_user;
-- Del cribado solo se escribe la revisión.
REVOKE UPDATE ON clinical.pre_exercise_screening FROM app_user;
GRANT UPDATE (review_decision, review_note, reviewed_by, reviewed_at) ON clinical.pre_exercise_screening TO app_user;
-- En borrador, una prueba se reemplaza (se borra y se inserta); cerrada, la evaluación se enmienda.
REVOKE UPDATE ON assessment.movement_screen FROM app_user;
REVOKE UPDATE ON assessment.physical_test_result FROM app_user;
GRANT DELETE ON assessment.movement_screen, assessment.physical_test_result TO app_user;
