-- 0006 · nutrition (Notion 05.2). El paciente no ve nada aquí: lee el snapshot publicado desde
-- tracking.active_plan_view, así nunca ve un borrador.

CREATE TABLE nutrition.energy_prescription (
  id                    uuid PRIMARY KEY,
  organization_id       uuid NOT NULL,
  patient_id            uuid NOT NULL,
  calculation_result_id uuid,                        -- composición usada, sin clave foránea
  weight_kg             numeric(6,2) NOT NULL,
  height_cm             numeric(6,2) NOT NULL,
  age_years             numeric(5,2) NOT NULL,
  sex                   char(1) NOT NULL,
  fat_free_mass_kg      numeric(6,2),
  ffm_method_code       text,
  rmr_method_code       text NOT NULL,
  rmr_method_version    text NOT NULL,
  rmr_kcal              numeric(7,1) NOT NULL,
  strategy              text NOT NULL CHECK (strategy IN ('ADDITIVE','FACTORIAL')),
  pal                   numeric(4,2) NOT NULL CHECK (pal BETWEEN 1.40 AND 2.40),
  activities            jsonb NOT NULL DEFAULT '[]', -- [{activityCode, met, minutes, sessionsPerWeek}]
  exercise_kcal_day     numeric(7,1) NOT NULL DEFAULT 0,
  tdee_kcal             numeric(7,1) NOT NULL,
  goal                  text NOT NULL CHECK (goal IN ('LOSE_FAT','GAIN_MUSCLE','MAINTAIN','RECOMPOSITION','PERFORMANCE')),
  adjustment_kcal       numeric(7,1) NOT NULL,        -- negativo = déficit
  target_kcal           numeric(7,1) NOT NULL,
  protein_g_per_kg      numeric(4,2) NOT NULL,
  fat_pct_kcal          numeric(4,1) NOT NULL,
  protein_g             numeric(6,1) NOT NULL,
  fat_g                 numeric(6,1) NOT NULL,
  cho_g                 numeric(6,1) NOT NULL CHECK (cho_g >= 0),
  projection            jsonb,                        -- peso objetivo, ritmo semanal, fecha estimada
  engine_version        text NOT NULL,
  inputs_hash           bytea NOT NULL,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prescription_by_patient ON nutrition.energy_prescription (organization_id, patient_id, created_at DESC);

CREATE TABLE nutrition.plan (
  id                       uuid PRIMARY KEY,
  organization_id          uuid NOT NULL,
  patient_id               uuid NOT NULL,
  lineage_id               uuid NOT NULL,             -- agrupa las versiones de un mismo plan
  version_no               int NOT NULL,
  modality                 text NOT NULL CHECK (modality IN ('EXCHANGES','COMPOSITION','WEEKLY_MENU')),
  status                   text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED','ARCHIVED')),
  energy_prescription_id   uuid REFERENCES nutrition.energy_prescription(id),
  exchange_list_id         uuid,                      -- food, sin clave foránea
  exchange_list_version    text,
  target_kcal              numeric(7,1) NOT NULL,
  target_cho_g             numeric(6,1) NOT NULL,
  target_protein_g         numeric(6,1) NOT NULL,
  target_fat_g             numeric(6,1) NOT NULL,
  hydration_target_ml      int,
  valid_from               date,
  valid_to                 date,
  instructions             text,
  published_at             timestamptz,
  published_by             uuid,
  snapshot                 jsonb,                     -- inmutable desde la publicación (RN-E15)
  snapshot_schema_version  smallint,
  snapshot_hash            bytea,
  created_by               uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  version                  int NOT NULL DEFAULT 0,
  UNIQUE (lineage_id, version_no)
);
CREATE UNIQUE INDEX plan_one_published ON nutrition.plan (patient_id) WHERE status = 'PUBLISHED';
CREATE INDEX plan_by_patient ON nutrition.plan (organization_id, patient_id, created_at DESC);

CREATE TABLE nutrition.plan_meal (
  id              uuid PRIMARY KEY,
  plan_id         uuid NOT NULL REFERENCES nutrition.plan(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  slot_code       text NOT NULL,                     -- BREAKFAST, MID_MORNING, LUNCH, AFTERNOON, DINNER, CUSTOM
  name_es         text NOT NULL,
  time_of_day     time,
  position        smallint NOT NULL,
  share_pct       numeric(5,2) NOT NULL,             -- suman 100 (RN-E09)
  day_of_week     smallint CHECK (day_of_week BETWEEN 1 AND 7)  -- solo en menú semanal
);

CREATE TABLE nutrition.plan_exchange (               -- total diario por grupo
  plan_id         uuid NOT NULL REFERENCES nutrition.plan(id) ON DELETE CASCADE,
  group_code      text NOT NULL,
  organization_id uuid NOT NULL,
  servings        int NOT NULL CHECK (servings >= 0),
  is_manual       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plan_id, group_code)
);

CREATE TABLE nutrition.plan_meal_exchange (          -- reparto por tiempo de comida
  plan_meal_id    uuid NOT NULL REFERENCES nutrition.plan_meal(id) ON DELETE CASCADE,
  group_code      text NOT NULL,
  organization_id uuid NOT NULL,
  servings        int NOT NULL CHECK (servings >= 0),
  PRIMARY KEY (plan_meal_id, group_code)
);

CREATE TABLE nutrition.plan_meal_allowed_food (      -- lo que el paciente puede elegir en ese tiempo y grupo
  plan_meal_id    uuid NOT NULL REFERENCES nutrition.plan_meal(id) ON DELETE CASCADE,
  group_code      text NOT NULL,
  food_id         uuid NOT NULL,
  organization_id uuid NOT NULL,
  grams           numeric(8,2) NOT NULL,
  household_text  text,
  PRIMARY KEY (plan_meal_id, group_code, food_id)
);

CREATE TABLE nutrition.plan_item (                   -- composición y menú: alimento o receta con cantidad
  id              uuid PRIMARY KEY,
  plan_meal_id    uuid NOT NULL REFERENCES nutrition.plan_meal(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  item_type       text NOT NULL CHECK (item_type IN ('FOOD','RECIPE')),
  item_id         uuid NOT NULL,
  grams           numeric(8,2),
  servings        numeric(6,2),
  household_text  text,
  option_label    text,                              -- 'Opción A'
  position        smallint NOT NULL
);

CREATE TABLE nutrition.plan_template (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  name            text NOT NULL,
  modality        text NOT NULL,
  payload         jsonb NOT NULL,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Inmutabilidad (RN-E14, RN-E15) -------------------------------------------------------------------
-- Rechaza cambios en un plan que no esté en DRAFT, salvo pasar de PUBLISHED a SUPERSEDED o ARCHIVED.
CREATE FUNCTION nutrition.guard_published_plan() RETURNS trigger
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
  RAISE EXCEPTION 'El plan % está %: es inmutable, editarlo crea una versión nueva (RN-E15)', OLD.id, OLD.status
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER plan_immutable_when_published
  BEFORE UPDATE ON nutrition.plan
  FOR EACH ROW EXECUTE FUNCTION nutrition.guard_published_plan();

-- RLS ----------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nutrition.energy_prescription', 'nutrition.plan', 'nutrition.plan_meal',
                           'nutrition.plan_exchange', 'nutrition.plan_meal_exchange',
                           'nutrition.plan_meal_allowed_food', 'nutrition.plan_item',
                           'nutrition.plan_template'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
    PERFORM app.restrict_patient(t::regclass);
    PERFORM app.restrict_platform_admin(t::regclass);
  END LOOP;
END $$;

-- Permisos -----------------------------------------------------------------------------------------
-- Hijos de un plan en borrador: se reemplazan al editarlo.
GRANT DELETE ON nutrition.plan_meal, nutrition.plan_exchange, nutrition.plan_meal_exchange,
  nutrition.plan_meal_allowed_food, nutrition.plan_item TO app_user;
