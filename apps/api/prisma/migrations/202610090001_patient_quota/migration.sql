-- P6 · Cupo de pacientes (RN-A03) con el equipo de atención en la base (RN-A05).
-- Con care_team_scope, un PROFESSIONAL o un ADMIN solo cuentan a los pacientes que ven: el cupo debe contar a todos los
-- activos de la organización del contexto. Solo devuelve un número, nunca filas.
CREATE FUNCTION app.count_active_patients() RETURNS integer
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*)::int FROM clinical.patient
  WHERE organization_id = app.org_id() AND status = 'ACTIVE'
$$;

GRANT EXECUTE ON FUNCTION app.count_active_patients() TO app_user;
