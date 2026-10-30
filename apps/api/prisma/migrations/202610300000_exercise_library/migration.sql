-- P12 · Biblioteca de ejercicios (RF-25, RN-F11, RN-F14, RN-I01; 07 §5, ADR-071): patrones de movimiento, ficha de cada
-- ejercicio, grupos musculares y equipos, y el ejercicio sugerido por patrón y nivel. Los ejercicios base y la tabla de
-- la V3 los carga catalog:load.

CREATE TABLE exercise.movement_pattern (             -- global: los 15 patrones de 07 §5
  code          text PRIMARY KEY,
  name_es       text NOT NULL,
  display_order smallint NOT NULL
);

INSERT INTO exercise.movement_pattern (code, name_es, display_order) VALUES
  ('SQUAT', 'Sentadilla', 1),
  ('HINGE', 'Bisagra', 2),
  ('HIP_EXTENSION', 'Extensión de cadera', 3),
  ('UNILATERAL', 'Unilateral', 4),
  ('HORIZONTAL_PUSH', 'Empuje horizontal', 5),
  ('VERTICAL_PUSH', 'Empuje vertical', 6),
  ('HORIZONTAL_PULL', 'Tracción horizontal', 7),
  ('VERTICAL_PULL', 'Tracción vertical', 8),
  ('SHOULDER', 'Hombro', 9),
  ('BICEPS', 'Bíceps', 10),
  ('TRICEPS', 'Tríceps', 11),
  ('CORE_ANTI_EXTENSION', 'Tronco anti-extensión', 12),
  ('CORE_ANTI_ROTATION', 'Tronco anti-rotación', 13),
  ('CALF', 'Pantorrilla', 14),
  ('CONDITIONING', 'Acondicionamiento', 15);

-- Los de la V3 y los que necesitan los ejercicios base. «Femoral» de la hoja es «Isquiosurales» en G-24.
INSERT INTO exercise.muscle_group (code, name_es, region, display_order) VALUES
  ('CHEST', 'Pectoral', 'Torso', 1),
  ('LATS', 'Dorsal', 'Torso', 2),
  ('UPPER_BACK', 'Espalda alta y romboides', 'Torso', 3),
  ('TRAPEZIUS', 'Trapecio', 'Torso', 4),
  ('LOWER_BACK', 'Zona lumbar', 'Tronco', 5),
  ('ABS', 'Abdomen', 'Tronco', 6),
  ('OBLIQUES', 'Oblicuos', 'Tronco', 7),
  ('DELTOID', 'Deltoides', 'Hombro', 8),
  ('FRONT_DELTOID', 'Deltoides anterior', 'Hombro', 9),
  ('LATERAL_DELTOID', 'Deltoides lateral', 'Hombro', 10),
  ('REAR_DELTOID', 'Deltoides posterior', 'Hombro', 11),
  ('ROTATOR_CUFF', 'Manguito rotador', 'Hombro', 12),
  ('BICEPS', 'Bíceps', 'Brazo', 13),
  ('TRICEPS', 'Tríceps', 'Brazo', 14),
  ('FOREARM', 'Antebrazo', 'Brazo', 15),
  ('QUADRICEPS', 'Cuádriceps', 'Pierna', 16),
  ('HAMSTRINGS', 'Isquiosurales (femoral)', 'Pierna', 17),
  ('GLUTES', 'Glúteo', 'Cadera', 18),
  ('ABDUCTORS', 'Abductores', 'Cadera', 19),
  ('ADDUCTORS', 'Aductores', 'Cadera', 20),
  ('HIP_FLEXORS', 'Flexores de cadera', 'Cadera', 21),
  ('CALF', 'Gemelo', 'Pierna', 22),
  ('SOLEUS', 'Sóleo', 'Pierna', 23),
  ('CARDIO', 'Cardiorrespiratorio', 'Cardiorrespiratorio', 24);

-- FULL_GYM es solo para el perfil de entrenamiento (07 §2): ningún ejercicio lo lleva.
INSERT INTO exercise.equipment (code, name_es) VALUES
  ('FULL_GYM', 'Gimnasio completo'),
  ('BODYWEIGHT', 'Peso corporal'),
  ('DUMBBELL', 'Mancuernas'),
  ('BARBELL', 'Barra'),
  ('KETTLEBELL', 'Pesa rusa'),
  ('MACHINE', 'Máquina'),
  ('CABLE', 'Polea'),
  ('BAND', 'Banda elástica'),
  ('BENCH', 'Banco'),
  ('BOX', 'Cajón'),
  ('PULLUP_BAR', 'Barra de dominadas'),
  ('SUSPENSION', 'Entrenador en suspensión'),
  ('AB_WHEEL', 'Rueda abdominal'),
  ('TREADMILL', 'Cinta'),
  ('BIKE', 'Bicicleta'),
  ('ROWER', 'Remoergómetro'),
  ('ELLIPTICAL', 'Elíptica'),
  ('JUMP_ROPE', 'Cuerda para saltar');

ALTER TABLE exercise.exercise                         -- ficha de la biblioteca de la V3 (07 §5)
  ADD CONSTRAINT exercise_movement_pattern_fkey
    FOREIGN KEY (movement_pattern) REFERENCES exercise.movement_pattern(code),
  ADD COLUMN code              text,                 -- código en la fuente (SQ01); un ejercicio propio no lleva
  ADD COLUMN level             text CHECK (level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
  ADD COLUMN caution_es        text,                 -- precaución general
  ADD COLUMN alternative_id    uuid REFERENCES exercise.exercise(id),  -- sustitución; easier/harder_variant_id son regresión y progresión (P-13)
  ADD COLUMN base_sets         smallint CHECK (base_sets BETWEEN 1 AND 10),
  ADD COLUMN base_reps_min     smallint CHECK (base_reps_min > 0),
  ADD COLUMN base_reps_max     smallint,
  ADD COLUMN base_measure      text NOT NULL DEFAULT 'REPS' CHECK (base_measure IN ('REPS','SECONDS','MINUTES')),  -- qué cuentan base_reps: la V3 pone 20 en la caminata y son minutos
  ADD COLUMN base_rest_seconds smallint CHECK (base_rest_seconds BETWEEN 0 AND 600),
  ADD COLUMN provisional       boolean NOT NULL DEFAULT false,  -- redactado por el equipo: Jeremy aún no lo revisa (ADR-071)
  ADD COLUMN updated_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN version           int NOT NULL DEFAULT 0,          -- un ejercicio propio se edita con If-Match (02 §6)
  ADD CONSTRAINT exercise_status CHECK (status IN ('ACTIVE','ARCHIVED')),
  ADD CHECK (base_reps_min IS NULL OR base_reps_max IS NULL OR base_reps_min <= base_reps_max);

-- La llave de la importación (RN-I04): el mismo código actualiza el mismo ejercicio.
CREATE UNIQUE INDEX exercise_code ON exercise.exercise (organization_id, code) NULLS NOT DISTINCT
  WHERE code IS NOT NULL;

CREATE TABLE exercise.pattern_choice (                -- ejercicio sugerido por patrón y nivel (07 §5)
  id               uuid PRIMARY KEY,
  organization_id  uuid,                              -- NULL = tabla de la V3; la organización la reemplaza fila por fila
  movement_pattern text NOT NULL REFERENCES exercise.movement_pattern(code),
  level            text NOT NULL CHECK (level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
  exercise_id      uuid NOT NULL REFERENCES exercise.exercise(id),
  UNIQUE NULLS NOT DISTINCT (organization_id, movement_pattern, level)
);

-- RLS ----------------------------------------------------------------------------------------------
-- Catálogos globales sin organization_id: todos leen y solo SYSTEM escribe (ADR-052).
SELECT app.enable_global_rls('exercise.movement_pattern');
SELECT app.enable_global_rls('exercise.muscle_group');
SELECT app.enable_global_rls('exercise.equipment');

SELECT app.enable_catalog_rls('exercise.pattern_choice');
SELECT app.restrict_patient('exercise.pattern_choice');

-- Editar un ejercicio reemplaza sus músculos (RN-I01): los suyos cada organización, los globales el importador.
CREATE POLICY catalog_delete ON exercise.exercise_muscle FOR DELETE
  USING (organization_id = app.org_id() OR (organization_id IS NULL AND app.role() = 'SYSTEM'));
GRANT DELETE ON exercise.exercise_muscle TO app_user;

-- Volver a la fila de la V3 borra la que puso la organización; la global no cumple la política.
CREATE POLICY catalog_delete ON exercise.pattern_choice FOR DELETE
  USING (organization_id = app.org_id());
GRANT DELETE ON exercise.pattern_choice TO app_user;
