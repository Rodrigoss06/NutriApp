-- P10 · Composición y menú semanal (RF-20, RF-21, RN-E16, ADR-062): solo un plan por intercambios lleva lista, y cada
-- alimento o receta de plan_item lleva su cantidad. La base lo rechaza aunque alguien se salte la API.

-- Plan --------------------------------------------------------------------------------------------------------------
-- La lista y su versión son de los intercambios (RN-E11); composición y menú no usan lista.
ALTER TABLE nutrition.plan
  ADD CONSTRAINT plan_exchange_list_by_modality CHECK (
    CASE WHEN modality = 'EXCHANGES'
      THEN exchange_list_id IS NOT NULL AND exchange_list_version IS NOT NULL
      ELSE exchange_list_id IS NULL AND exchange_list_version IS NULL
    END);

-- Alimentos y recetas de composición y menú -------------------------------------------------------------------------
-- Un alimento va en gramos de parte comestible, con su medida casera si se quiere (RN-E12); una receta, en porciones.
-- option_label: la opción A o B de un tiempo del menú; NULL en composición.
ALTER TABLE nutrition.plan_item
  ADD CONSTRAINT plan_item_quantity CHECK (
    (item_type = 'FOOD' AND grams > 0 AND servings IS NULL)
    OR (item_type = 'RECIPE' AND servings > 0 AND grams IS NULL AND household_text IS NULL)),
  ADD CONSTRAINT plan_item_option CHECK (option_label IS NULL OR option_label IN ('A', 'B'));

-- El orden en que el profesional los listó, en cada tiempo y opción.
CREATE UNIQUE INDEX plan_item_position ON nutrition.plan_item (plan_meal_id, option_label, position) NULLS NOT DISTINCT;
