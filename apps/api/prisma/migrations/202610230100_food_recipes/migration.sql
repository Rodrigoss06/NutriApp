-- P10 · Recetario (RF-21, RN-E12, ADR-061): una receta rinde más de cero porciones, se archiva en vez de borrarse y se
-- busca por nombre como un alimento. Su caché de nutrientes por porción la recalcula la API al cambiar sus ingredientes
-- o un alimento propio que usa.

ALTER TABLE food.recipe
  ADD CONSTRAINT recipe_status CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT recipe_servings_positive CHECK (servings > 0),
  ADD CONSTRAINT recipe_cooked_weight_positive CHECK (cooked_weight_g IS NULL OR cooked_weight_g > 0),
  ADD COLUMN search_text text GENERATED ALWAYS AS (app.unaccent_immutable(lower(name_es))) STORED;
CREATE INDEX recipe_search ON food.recipe USING gin (search_text gin_trgm_ops);

-- Las recetas que usan un alimento: editar un alimento propio recalcula su caché.
CREATE INDEX recipe_ingredient_food ON food.recipe_ingredient (food_id);
