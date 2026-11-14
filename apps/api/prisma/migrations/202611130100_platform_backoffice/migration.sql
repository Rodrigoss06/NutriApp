-- P15 · PR 3 · el panel interno (RF-39; RN-A02, RN-A03, RN-A09; ADR-127): planes, uso de los cupos y banderas por organización.

-- Planes (N9): todos los leen; solo el panel interno (PLATFORM_ADMIN) y SYSTEM los crean o los cambian. Un plan no se borra: se
-- desactiva. Sus límites se congelan en cada suscripción, así que cambiarlos no toca las vigentes (RN-A03).
ALTER TABLE tenancy.subscription_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.subscription_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_read ON tenancy.subscription_plan FOR SELECT USING (true);
CREATE POLICY plan_insert ON tenancy.subscription_plan FOR INSERT
  WITH CHECK (app.role() IN ('PLATFORM_ADMIN', 'SYSTEM'));
CREATE POLICY plan_update ON tenancy.subscription_plan FOR UPDATE
  USING (app.role() IN ('PLATFORM_ADMIN', 'SYSTEM'))
  WITH CHECK (app.role() IN ('PLATFORM_ADMIN', 'SYSTEM'));
REVOKE UPDATE ON tenancy.subscription_plan FROM app_user;
GRANT UPDATE (name, max_active_patients, max_professionals, duration_months, price_cents, currency, is_active)
  ON tenancy.subscription_plan TO app_user;
ALTER TABLE tenancy.subscription_plan
  ADD CONSTRAINT subscription_plan_code CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  ADD CONSTRAINT subscription_plan_name CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT subscription_plan_limits CHECK (
    max_active_patients > 0 AND max_professionals > 0 AND duration_months BETWEEN 1 AND 60 AND price_cents >= 0),
  ADD CONSTRAINT subscription_plan_currency CHECK (currency ~ '^[A-Z]{3}$');

-- El uso del cupo de cada organización para el panel interno: solo cuentas, ningún dato clínico (RN-A09). Pacientes activos y
-- miembros activos, como los cuenta RN-A03. Solo responde a PLATFORM_ADMIN.
CREATE FUNCTION app.organization_usage()
RETURNS TABLE (organization_id uuid, active_patients int, active_professionals int)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT o.id,
         (SELECT count(*)::int FROM clinical.patient p WHERE p.organization_id = o.id AND p.status = 'ACTIVE'),
         (SELECT count(*)::int FROM tenancy.member m WHERE m.organization_id = o.id AND m.status = 'ACTIVE')
  FROM tenancy.organization o
  WHERE app.role() = 'PLATFORM_ADMIN'
$$;
REVOKE ALL ON FUNCTION app.organization_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.organization_usage() TO app_user;

-- Banderas por organización: una clave del catálogo del código (ADR-127). La fila de la organización manda sobre la global y la
-- global, sobre el valor de fábrica.
ALTER TABLE platform.feature_flag
  ADD CONSTRAINT feature_flag_key CHECK (key ~ '^[A-Z][A-Z0-9_]{1,63}$');
-- La organización lee sus banderas, pero solo el panel interno (y SYSTEM) las escribe: segunda capa sobre catalog_insert y
-- catalog_update, que dejaban escribir las filas propias.
CREATE POLICY platform_writes_insert ON platform.feature_flag AS RESTRICTIVE FOR INSERT
  WITH CHECK (app.role() IN ('PLATFORM_ADMIN', 'SYSTEM'));
CREATE POLICY platform_writes_update ON platform.feature_flag AS RESTRICTIVE FOR UPDATE
  USING (app.role() IN ('PLATFORM_ADMIN', 'SYSTEM'))
  WITH CHECK (app.role() IN ('PLATFORM_ADMIN', 'SYSTEM'));
