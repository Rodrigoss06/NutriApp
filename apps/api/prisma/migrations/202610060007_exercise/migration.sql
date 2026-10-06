-- 0007 · exercise (Notion 05.2). Biblioteca global y de cada organización (RN-I01).

CREATE TABLE exercise.muscle_group (code text PRIMARY KEY, name_es text NOT NULL, region text NOT NULL, display_order smallint NOT NULL);
CREATE TABLE exercise.equipment    (code text PRIMARY KEY, name_es text NOT NULL);

CREATE TABLE exercise.exercise (
  id                uuid PRIMARY KEY,
  organization_id   uuid,                            -- NULL = biblioteca global
  name_es           text NOT NULL,
  aliases           text[] NOT NULL DEFAULT '{}',
  modality          text NOT NULL CHECK (modality IN ('STRENGTH','CARDIO','MOBILITY','PLYOMETRIC')),
  movement_pattern  text,
  equipment_code    text REFERENCES exercise.equipment(code),
  is_unilateral     boolean NOT NULL DEFAULT false,
  easier_variant_id uuid REFERENCES exercise.exercise(id),  -- regresión (N13)
  harder_variant_id uuid REFERENCES exercise.exercise(id),  -- progresión
  media_url         text,
  instructions      text,
  status            text NOT NULL DEFAULT 'ACTIVE',
  search_text       text GENERATED ALWAYS AS (app.unaccent_immutable(lower(name_es))) STORED,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exercise_search ON exercise.exercise USING gin (search_text gin_trgm_ops);

CREATE TABLE exercise.exercise_muscle (
  exercise_id     uuid NOT NULL REFERENCES exercise.exercise(id),
  muscle_code     text NOT NULL REFERENCES exercise.muscle_group(code),
  organization_id uuid,
  role            text NOT NULL CHECK (role IN ('PRIMARY','SECONDARY')),  -- 1 y 0.5 (RN-F06)
  PRIMARY KEY (exercise_id, muscle_code)
);

CREATE TABLE exercise.physical_activity (            -- Compendium 2024, subconjunto traducido
  code           text PRIMARY KEY,                   -- código del compendio
  major_heading  text NOT NULL,
  description_es text NOT NULL,
  met            numeric(4,1) NOT NULL,
  source_version text NOT NULL DEFAULT 'COMPENDIUM_2024'
);

-- RLS ----------------------------------------------------------------------------------------------
-- muscle_group, equipment y physical_activity no tienen organization_id: son globales.
SELECT app.enable_catalog_rls('exercise.exercise');
SELECT app.enable_catalog_rls('exercise.exercise_muscle');

-- El paciente lee la biblioteca (regresiones y progresiones, RN-F11); no escribe.
SELECT app.restrict_patient('exercise.exercise', 'true');
SELECT app.restrict_patient('exercise.exercise_muscle', 'true');
