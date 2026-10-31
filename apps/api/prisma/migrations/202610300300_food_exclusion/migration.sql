-- RN-E17 · Alimentos que una alergia o intolerancia excluye de la dieta (07 §12, ADR-074). El nombre de la condición nunca
-- se compara con el de los alimentos: el enlace lo hace quien atiende.

CREATE TABLE nutrition.food_exclusion (
  condition_id    uuid NOT NULL,                       -- clinical.condition: otro contexto, sin clave foránea
  food_id         uuid NOT NULL,                       -- food.food: otro contexto, sin clave foránea
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (condition_id, food_id)
);
CREATE INDEX food_exclusion_by_patient ON nutrition.food_exclusion (organization_id, patient_id);

-- RLS: como el resto del expediente, el paciente no lo ve. Lo escribe el equipo de atención (RN-A05).
SELECT app.enable_tenant_rls('nutrition.food_exclusion');
SELECT app.restrict_patient('nutrition.food_exclusion');
SELECT app.restrict_platform_admin('nutrition.food_exclusion');
SELECT app.enable_care_team_scope('nutrition.food_exclusion');
SELECT app.restrict_account('nutrition.food_exclusion');

-- Enlazar reemplaza la lista de la condición: se borra y se inserta, nunca se actualiza.
REVOKE UPDATE ON nutrition.food_exclusion FROM app_user;
GRANT DELETE ON nutrition.food_exclusion TO app_user;
