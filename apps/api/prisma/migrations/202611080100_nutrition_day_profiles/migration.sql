-- P14.5 (PR 1c) · Perfiles de día del plan (07 §2 y §8; P-20, respondida por Jeremy el 2026-11-08; ADR-100). Reemplaza las kcal
-- de descanso de 202611080000 (ADR-099), que no llegaron a staging: cada perfil lleva sus gramos y las kcal salen de ellos.

-- Plan -------------------------------------------------------------------------------------------------------------
ALTER TABLE nutrition.plan DROP COLUMN rest_day_kcal;

-- Entrenamiento es la meta de la prescripción (las columnas target_* del plan) y no se guarda aquí. Descanso es REST; los
-- propios (alto, medio, bajo, refeed, competencia...) llevan el código que les da el coach. Las kcal no se guardan: salen
-- de los gramos con MACROS_DAY_PROFILE, que el snapshot congela con su método (RN-D01).
CREATE TABLE nutrition.plan_day_profile (
  plan_id         uuid NOT NULL REFERENCES nutrition.plan(id) ON DELETE CASCADE,
  code            text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,19}$' AND code <> 'TRAINING'),
  organization_id uuid NOT NULL,
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  cho_g           numeric(6,1) NOT NULL CHECK (cho_g >= 0),
  protein_g       numeric(6,1) NOT NULL CHECK (protein_g >= 0),
  fat_g           numeric(6,1) NOT NULL CHECK (fat_g >= 0),
  position        smallint NOT NULL,
  PRIMARY KEY (plan_id, code)
);
SELECT app.enable_tenant_rls('nutrition.plan_day_profile');
SELECT app.restrict_patient('nutrition.plan_day_profile');
SELECT app.restrict_platform_admin('nutrition.plan_day_profile');
GRANT DELETE ON nutrition.plan_day_profile TO app_user;

-- Como los demás hijos del plan, solo cambia mientras el plan está en DRAFT (RN-E15).
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
  IF TG_TABLE_NAME IN ('plan_meal', 'plan_exchange', 'plan_day_profile') THEN
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
    RAISE EXCEPTION 'El plan % está %: sus tiempos, intercambios, alimentos y perfiles no cambian (RN-E15)', v_plan_id,
      coalesce(v_status, 'sin plan')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN v_row;
END $$;
CREATE TRIGGER plan_day_profile_only_in_draft BEFORE INSERT OR UPDATE OR DELETE ON nutrition.plan_day_profile
  FOR EACH ROW EXECUTE FUNCTION nutrition.guard_plan_children();

-- Programa ---------------------------------------------------------------------------------------------------------
-- El perfil del día de una sesión (P-20.4): null es Entrenamiento. El código es el de un perfil del plan nutricional; si el
-- plan no lo tiene, el día lleva la meta de la prescripción. Como lo demás de la sesión, solo cambia en DRAFT (RN-F12).
ALTER TABLE training.session
  ADD COLUMN day_profile_code text CHECK (day_profile_code ~ '^[A-Z][A-Z0-9_]{0,19}$');

-- Meta del día y resumen -------------------------------------------------------------------------------------------
-- El perfil con que se fijó la meta de alimentación del día: su código y su nombre, para mostrarlo. Sin perfiles en el plan,
-- null (una sola meta).
ALTER TABLE tracking.daily_target
  ADD COLUMN day_profile_code text,
  ADD COLUMN day_profile_name text;
ALTER TABLE analytics.patient_daily_summary
  ADD COLUMN day_profile_code text,
  ADD COLUMN day_profile_name text;
