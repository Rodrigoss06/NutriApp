-- 0005 · food (Notion 05.2). Catálogos globales de solo lectura para las organizaciones (RN-I01).

CREATE TABLE food.source (
  code        text PRIMARY KEY,                      -- 'TPCA_2017', 'DEXTRE_2022', 'ADA', 'USDA_FDC', 'ORG'
  name        text NOT NULL,
  edition     text,
  publisher   text,
  license     text NOT NULL,
  url         text,
  imported_at timestamptz
);

CREATE TABLE food.nutrient (
  code          text PRIMARY KEY,                    -- INFOODS: ENERC_KCAL, PROCNT, FAT, CHOCDF, FIBTG, CA, FE, NA, VITC...
  name_es       text NOT NULL,
  unit          text NOT NULL,
  display_order smallint NOT NULL,
  is_core       boolean NOT NULL DEFAULT false       -- energía, macronutrientes y fibra
);

CREATE TABLE food.food_group (
  code        text PRIMARY KEY,
  source_code text NOT NULL REFERENCES food.source(code),
  name_es     text NOT NULL
);

CREATE TABLE food.food (
  id                 uuid PRIMARY KEY,
  organization_id    uuid,                           -- NULL = catálogo global
  source_code        text NOT NULL REFERENCES food.source(code),
  source_food_code   text,
  name_es            text NOT NULL,
  aliases            text[] NOT NULL DEFAULT '{}',
  group_code         text REFERENCES food.food_group(code),
  edible_portion_pct numeric(5,2) NOT NULL DEFAULT 100,
  state              text NOT NULL DEFAULT 'RAW' CHECK (state IN ('RAW','COOKED','PROCESSED','READY')),
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
  tags               text[] NOT NULL DEFAULT '{}',
  search_text        text GENERATED ALWAYS AS (app.unaccent_immutable(lower(name_es))) STORED,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, source_code, source_food_code)
);
CREATE INDEX food_search ON food.food USING gin (search_text gin_trgm_ops);

CREATE TABLE food.food_nutrient (                    -- formato largo: nutrientes nuevos sin migración
  food_id         uuid NOT NULL REFERENCES food.food(id),
  nutrient_code   text NOT NULL REFERENCES food.nutrient(code),
  organization_id uuid,                              -- copia de food para la RLS
  value_per_100g  numeric(12,4),                     -- NULL = sin dato, distinto de cero (RN-I03)
  value_flag      text CHECK (value_flag IN ('MEASURED','CALCULATED','TRACE','MISSING','IMPUTED')),
  PRIMARY KEY (food_id, nutrient_code)
);

CREATE TABLE food.household_measure (
  id              uuid PRIMARY KEY,
  food_id         uuid NOT NULL REFERENCES food.food(id),
  organization_id uuid,
  name_es         text NOT NULL,                     -- '1 taza', '1 unidad mediana'
  grams           numeric(8,2) NOT NULL,
  is_default      boolean NOT NULL DEFAULT false
);

CREATE TABLE food.exchange_list (                    -- versionada (RN-E11)
  id              uuid PRIMARY KEY,
  organization_id uuid,
  code            text NOT NULL,                     -- 'DEXTRE', 'ADA'
  name            text NOT NULL,
  source_code     text NOT NULL REFERENCES food.source(code),
  version         text NOT NULL,
  status          text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  license_note    text,
  published_at    timestamptz,
  UNIQUE NULLS NOT DISTINCT (organization_id, code, version)
);

CREATE TABLE food.exchange_group (
  id               uuid PRIMARY KEY,
  exchange_list_id uuid NOT NULL REFERENCES food.exchange_list(id),
  organization_id  uuid,
  code             text NOT NULL,                    -- VEG, FRU, MILK_SKIM, STA, MEAT_LEAN, FAT...
  parent_code      text,                             -- subgrupos
  name_es          text NOT NULL,
  kcal             numeric(7,2) NOT NULL,
  cho_g            numeric(6,2) NOT NULL,
  protein_g        numeric(6,2) NOT NULL,
  fat_g            numeric(6,2) NOT NULL,
  display_order    smallint NOT NULL,
  UNIQUE (exchange_list_id, code)
);

CREATE TABLE food.exchange_equivalent (              -- «1 intercambio de cereal = 30 g de arroz crudo»
  id                uuid PRIMARY KEY,
  exchange_group_id uuid NOT NULL REFERENCES food.exchange_group(id),
  organization_id   uuid,
  food_id           uuid NOT NULL REFERENCES food.food(id),
  grams             numeric(8,2) NOT NULL,
  household_text    text,
  UNIQUE (exchange_group_id, food_id)
);

CREATE TABLE food.recipe (
  id                    uuid PRIMARY KEY,
  organization_id       uuid NOT NULL,
  name_es               text NOT NULL,
  servings              numeric(6,2) NOT NULL,
  cooked_weight_g       numeric(8,2),                -- factor de rendimiento (RN-E12)
  instructions          text,
  tags                  text[] NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'ACTIVE',
  nutrients_per_serving jsonb NOT NULL DEFAULT '{}', -- caché que el dominio recalcula al cambiar ingredientes
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               int NOT NULL DEFAULT 0
);

CREATE TABLE food.recipe_ingredient (
  recipe_id       uuid NOT NULL REFERENCES food.recipe(id) ON DELETE CASCADE,
  position        smallint NOT NULL,
  organization_id uuid NOT NULL,
  food_id         uuid NOT NULL REFERENCES food.food(id),
  grams           numeric(8,2) NOT NULL CHECK (grams > 0),
  household_text  text,
  PRIMARY KEY (recipe_id, position)
);

-- RLS ----------------------------------------------------------------------------------------------
-- source, nutrient y food_group no tienen organization_id: son globales y los carga app_owner.
SELECT app.enable_catalog_rls('food.food');
SELECT app.enable_catalog_rls('food.food_nutrient');
SELECT app.enable_catalog_rls('food.household_measure');
SELECT app.enable_catalog_rls('food.exchange_list');
SELECT app.enable_catalog_rls('food.exchange_group');
SELECT app.enable_catalog_rls('food.exchange_equivalent');
SELECT app.enable_tenant_rls('food.recipe');
SELECT app.enable_tenant_rls('food.recipe_ingredient');

-- El paciente lee el catálogo para registrar fuera del plan (RN-G05); no escribe.
SELECT app.restrict_patient('food.food', 'true');
SELECT app.restrict_patient('food.food_nutrient', 'true');
SELECT app.restrict_patient('food.household_measure', 'true');
SELECT app.restrict_patient('food.exchange_list', 'true');
SELECT app.restrict_patient('food.exchange_group', 'true');
SELECT app.restrict_patient('food.exchange_equivalent', 'true');
SELECT app.restrict_patient('food.recipe', 'true');
SELECT app.restrict_patient('food.recipe_ingredient', 'true');

-- Permisos -----------------------------------------------------------------------------------------
-- Los ingredientes de una receta se reemplazan al editarla.
GRANT DELETE ON food.recipe_ingredient TO app_user;
