-- P14.5 (PR 1b) · Porciones de cada perfil de día (07 §2; P-20.5, respondida por Jeremy el 2026-11-08; ADR-102). El perfil es el
-- mismo plan y solo cambia la cantidad del alimento fuente: en intercambios, los almidones de cada tiempo; en composición y
-- menú, los gramos de un alimento o las porciones de una receta que el coach cambia. Lo demás es lo del plan.

-- Intercambios ------------------------------------------------------------------------------------------------------
-- Los almidones de cada tiempo en un perfil, cuando el coach cambia la sugerencia de STARCH_BY_DAY_PROFILE. Un perfil sin filas
-- lleva la sugerencia, que el snapshot congela con su método (RN-D01). Solo almidones (P-20.5).
CREATE TABLE nutrition.plan_meal_profile_exchange (
  plan_meal_id    uuid NOT NULL REFERENCES nutrition.plan_meal(id) ON DELETE CASCADE,
  profile_code    text NOT NULL,
  group_code      text NOT NULL CHECK (group_code = 'STA'),
  plan_id         uuid NOT NULL,
  organization_id uuid NOT NULL,
  servings        int NOT NULL CHECK (servings >= 0),
  PRIMARY KEY (plan_meal_id, profile_code, group_code),
  FOREIGN KEY (plan_id, profile_code) REFERENCES nutrition.plan_day_profile (plan_id, code) ON DELETE CASCADE
);
CREATE INDEX plan_meal_profile_exchange_by_profile
  ON nutrition.plan_meal_profile_exchange (plan_id, profile_code);

-- Composición y menú ------------------------------------------------------------------------------------------------
-- La cantidad de un alimento (gramos y medida casera) o de una receta (porciones) en un perfil: solo la que cambia lo del
-- plan. Con 0, ese día no va.
CREATE TABLE nutrition.plan_item_profile (
  plan_item_id    uuid NOT NULL REFERENCES nutrition.plan_item(id) ON DELETE CASCADE,
  profile_code    text NOT NULL,
  plan_id         uuid NOT NULL,
  organization_id uuid NOT NULL,
  grams           numeric(8,2) CHECK (grams >= 0),
  servings        numeric(6,2) CHECK (servings >= 0),
  household_text  text,
  PRIMARY KEY (plan_item_id, profile_code),
  FOREIGN KEY (plan_id, profile_code) REFERENCES nutrition.plan_day_profile (plan_id, code) ON DELETE CASCADE,
  CONSTRAINT plan_item_profile_quantity CHECK (
    (grams IS NOT NULL AND servings IS NULL)
    OR (servings IS NOT NULL AND grams IS NULL AND household_text IS NULL))
);
CREATE INDEX plan_item_profile_by_profile ON nutrition.plan_item_profile (plan_id, profile_code);

-- RLS y permisos ----------------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nutrition.plan_meal_profile_exchange', 'nutrition.plan_item_profile'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
    PERFORM app.restrict_patient(t::regclass);
    PERFORM app.restrict_platform_admin(t::regclass);
  END LOOP;
END $$;
-- Hijos de un plan en borrador: se reemplazan al editarlo.
GRANT DELETE ON nutrition.plan_meal_profile_exchange, nutrition.plan_item_profile TO app_user;

-- Inmutabilidad (RN-E15) --------------------------------------------------------------------------------------------
-- Como los demás hijos del plan, solo cambian mientras el plan está en DRAFT. Llevan plan_id: lo borrado en cascada desde un
-- tiempo, un alimento o un perfil todavía encuentra su plan.
CREATE OR REPLACE FUNCTION nutrition.guard_plan_children() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_row     record;
  v_plan_id uuid;
  v_status  text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  IF TG_TABLE_NAME IN ('plan_meal', 'plan_exchange', 'plan_day_profile', 'plan_meal_profile_exchange',
                       'plan_item_profile') THEN
    v_plan_id := v_row.plan_id;
  ELSE
    SELECT plan_id INTO v_plan_id FROM nutrition.plan_meal WHERE id = v_row.plan_meal_id;
    -- Borrar un tiempo de comida borra en cascada lo suyo: su propio disparador ya exigió el borrador.
    IF TG_OP = 'DELETE' AND v_plan_id IS NULL THEN
      RETURN OLD;
    END IF;
  END IF;
  SELECT status INTO v_status FROM nutrition.plan WHERE id = v_plan_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'El plan % está %: sus tiempos, intercambios, alimentos, perfiles y porciones no cambian (RN-E15)',
      v_plan_id, coalesce(v_status, 'sin plan')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN v_row;
END $$;
CREATE TRIGGER plan_meal_profile_exchange_only_in_draft
  BEFORE INSERT OR UPDATE OR DELETE ON nutrition.plan_meal_profile_exchange
  FOR EACH ROW EXECUTE FUNCTION nutrition.guard_plan_children();
CREATE TRIGGER plan_item_profile_only_in_draft
  BEFORE INSERT OR UPDATE OR DELETE ON nutrition.plan_item_profile
  FOR EACH ROW EXECUTE FUNCTION nutrition.guard_plan_children();
