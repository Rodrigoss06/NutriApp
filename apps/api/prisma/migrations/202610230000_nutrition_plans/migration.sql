-- P9 · Dieta por intercambios (RF-19, RF-23, ADR-057): un plan publicado es inmutable también en sus hijos, y lo que
-- se publica lleva su snapshot. La base lo rechaza aunque alguien se salte la API (RN-E14, RN-E15).

-- Hijos de un plan --------------------------------------------------------------------------------------------------
-- plan_meal y plan_exchange cuelgan del plan; plan_meal_exchange, plan_meal_allowed_food y plan_item, de un tiempo de
-- comida. Solo se insertan, cambian o borran mientras su plan está en DRAFT.
CREATE FUNCTION nutrition.guard_plan_children() RETURNS trigger
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
  IF TG_TABLE_NAME IN ('plan_meal', 'plan_exchange') THEN
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
    RAISE EXCEPTION 'El plan % está %: sus tiempos, intercambios y alimentos no cambian (RN-E15)', v_plan_id,
      coalesce(v_status, 'sin plan')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN v_row;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plan_meal', 'plan_exchange', 'plan_meal_exchange', 'plan_meal_allowed_food',
                           'plan_item'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON nutrition.%I
                      FOR EACH ROW EXECUTE FUNCTION nutrition.guard_plan_children()', t || '_only_in_draft', t);
  END LOOP;
END $$;

-- Plan --------------------------------------------------------------------------------------------------------------
-- Lo que no es borrador se publicó: tiene su snapshot con su versión y su hash, quién y cuándo, y desde qué día vale.
ALTER TABLE nutrition.plan
  ADD CONSTRAINT plan_published_has_snapshot CHECK (
    status = 'DRAFT'
    OR (snapshot IS NOT NULL AND snapshot_schema_version IS NOT NULL AND snapshot_hash IS NOT NULL
        AND published_at IS NOT NULL AND published_by IS NOT NULL AND valid_from IS NOT NULL)),
  ADD CONSTRAINT plan_hydration_positive CHECK (hydration_target_ml IS NULL OR hydration_target_ml > 0);

-- Editar un plan publicado crea una versión nueva en borrador (02 §7): una sola a la vez por plan.
CREATE UNIQUE INDEX plan_one_draft_per_lineage ON nutrition.plan (lineage_id) WHERE status = 'DRAFT';

-- Tiempos de comida, reparto y alimentos permitidos (RN-E09, RN-G05) ---------------------------------------------
ALTER TABLE nutrition.plan_meal
  ADD CONSTRAINT plan_meal_share CHECK (share_pct >= 0 AND share_pct <= 100);
CREATE UNIQUE INDEX plan_meal_position ON nutrition.plan_meal (plan_id, day_of_week, position) NULLS NOT DISTINCT;

-- is_manual: el profesional cambió el reparto automático de ese grupo en ese tiempo.
ALTER TABLE nutrition.plan_meal_exchange ADD COLUMN is_manual boolean NOT NULL DEFAULT false;

-- position: el orden en que el profesional los listó.
ALTER TABLE nutrition.plan_meal_allowed_food
  ADD COLUMN position smallint NOT NULL DEFAULT 0,
  ADD CONSTRAINT plan_meal_allowed_food_grams CHECK (grams > 0);
