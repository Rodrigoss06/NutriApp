-- P8 · TAFERA 2016 (RF-38, ADR-053): medidas caseras con su peso bruto y neto, y factores de conversión de peso cocido
-- a crudo, enlazados con los alimentos de la TPCA 2017. Los datos los carga el importador (pnpm catalog:load) desde
-- seeds/food/, después de la TPCA (RN-I04).

-- Fuente (RN-I02) ----------------------------------------------------------------------------------------------------
-- A diferencia de la TPCA, la TAFERA autoriza reproducirla citando la fuente.
INSERT INTO food.source (code, name, edition, publisher, license, url) VALUES
  ('TAFERA_2016', 'Tablas auxiliares para la formulación y evaluación de regímenes alimentarios',
   '2.ª edición, 2016 (ISBN 978-612-310-093-3)',
   'Instituto Nacional de Salud, Centro Nacional de Alimentación y Nutrición (INS-CENAN)',
   'Se autoriza su reproducción total o parcial, siempre y cuando se cite la fuente',
   'https://lamejorreceta.ins.gob.pe/sites/default/files/2020-12/TAFERA%202016%20OK%20final.pdf')
ON CONFLICT (code) DO NOTHING;

-- Medidas caseras ----------------------------------------------------------------------------------------------------
-- grams es el peso neto: la parte comestible de la medida (RN-E12). gross_grams, el bruto, con cáscara, hueso o
-- envase; NULL si la fuente no lo da o da varios (formas de compra del cuy y del conejo). Una medida de una fuente
-- global se identifica por su código en ella; las propias de una organización no llevan código.
ALTER TABLE food.household_measure
  ADD COLUMN gross_grams numeric(8,2),
  ADD COLUMN source_code text REFERENCES food.source(code),
  ADD COLUMN source_measure_code text,
  ADD CONSTRAINT household_measure_grams CHECK (grams > 0),
  ADD CONSTRAINT household_measure_gross CHECK (gross_grams IS NULL OR gross_grams >= grams),
  ADD CONSTRAINT household_measure_source CHECK (source_measure_code IS NULL OR source_code IS NOT NULL);
CREATE UNIQUE INDEX household_measure_by_source ON food.household_measure
  (organization_id, source_code, source_measure_code) NULLS NOT DISTINCT WHERE source_measure_code IS NOT NULL;
CREATE INDEX household_measure_by_food ON food.household_measure (food_id);

-- Factores de conversión de peso cocido a crudo ------------------------------------------------------------------------
-- Peso crudo = peso cocido × factor, para el alimento crudo al que apunta food_id. name_es es el alimento tal como lo
-- nombra la fuente («Pollo, ala»), que puede ser un corte o una forma del alimento de la TPCA.
CREATE TABLE food.cooking_factor (
  id                   uuid PRIMARY KEY,
  organization_id      uuid,                           -- NULL = catálogo global
  food_id              uuid NOT NULL REFERENCES food.food(id),
  source_code          text NOT NULL REFERENCES food.source(code),
  source_item_code     text,                           -- II-001: la TAFERA no numera su módulo II
  name_es              text NOT NULL,
  cooking_method_es    text NOT NULL,                  -- 'Sancochado', 'Frito', 'Asado a la olla'
  cooked_to_raw_factor numeric(5,2) NOT NULL CHECK (cooked_to_raw_factor > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cooking_factor_by_source ON food.cooking_factor
  (organization_id, source_code, source_item_code) NULLS NOT DISTINCT WHERE source_item_code IS NOT NULL;
CREATE INDEX cooking_factor_by_food ON food.cooking_factor (food_id);

-- RLS: catálogo global de solo lectura y propio de cada organización (RN-I01); el paciente lo lee, como los alimentos.
SELECT app.enable_catalog_rls('food.cooking_factor');
SELECT app.restrict_patient('food.cooking_factor', 'true');
