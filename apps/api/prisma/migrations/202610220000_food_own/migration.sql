-- P8 · Alimentos propios de la organización (RN-I01, ADR-054): bloqueo optimista al editarlos y medidas caseras que se
-- reemplazan. Los catálogos globales siguen de solo lectura para las organizaciones.

-- Un alimento propio se edita con If-Match (02 §6); los globales los cambia solo el importador.
ALTER TABLE food.food ADD COLUMN version int NOT NULL DEFAULT 0;

-- Editar un alimento propio reemplaza sus medidas. Solo se borran las de la propia organización: las globales
-- (organization_id NULL) no cumplen la política.
CREATE POLICY catalog_delete ON food.household_measure FOR DELETE USING (organization_id = app.org_id());
GRANT DELETE ON food.household_measure TO app_user;
