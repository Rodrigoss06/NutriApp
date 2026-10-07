-- P5 · Acceso: límite de intentos e invitaciones pendientes únicas.

-- Límite de intentos (ADR-030) ----------------------------------------------------------------------
-- Una fila por clave (SHA-256 de «alcance:valor», calculado en la API: nunca un correo ni una IP en claro).
-- Ventana fija. app_user no toca la tabla: solo las funciones de abajo, que son de app_owner.
CREATE TABLE platform.rate_limit (
  key          bytea PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits         int NOT NULL
);

REVOKE ALL ON platform.rate_limit FROM app_user, app_readonly;
ALTER TABLE platform.rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rate_limit FORCE ROW LEVEL SECURITY;
-- Sin políticas: ni con un contexto inventado se lee o escribe directo.

-- Suma un intento a la ventana vigente de la clave y dice si sigue permitido y cuántos segundos faltan para la
-- próxima ventana. Un solo UPSERT atómico: dos peticiones a la vez nunca cuentan una sola vez.
CREATE FUNCTION app.hit_rate_limit(p_key bytea, p_window_seconds int, p_max int)
RETURNS TABLE (hits int, allowed boolean, retry_after_seconds int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_epoch numeric := extract(epoch FROM clock_timestamp());
  v_start timestamptz;
  v_hits  int;
BEGIN
  IF p_window_seconds NOT BETWEEN 1 AND 86400 OR p_max < 1 OR octet_length(p_key) <> 32 THEN
    RAISE EXCEPTION 'Límite de intentos mal configurado' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_start := to_timestamp(floor(v_epoch / p_window_seconds) * p_window_seconds);

  INSERT INTO platform.rate_limit AS r (key, window_start, hits)
  VALUES (p_key, v_start, 1)
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE WHEN r.window_start = EXCLUDED.window_start THEN r.hits + 1 ELSE 1 END,
        window_start = EXCLUDED.window_start
  RETURNING r.hits INTO v_hits;

  RETURN QUERY SELECT
    v_hits,
    v_hits <= p_max,
    greatest(1, ceil(extract(epoch FROM v_start) + p_window_seconds - v_epoch))::int;
END $$;

-- Limpieza diaria del worker: ventanas de más de un día.
CREATE FUNCTION app.purge_rate_limits() RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH removed AS (
    DELETE FROM platform.rate_limit WHERE window_start < clock_timestamp() - interval '1 day' RETURNING 1
  )
  SELECT count(*)::int FROM removed
$$;

GRANT EXECUTE ON FUNCTION app.hit_rate_limit(bytea, int, int), app.purge_rate_limits() TO app_user;

-- Invitaciones --------------------------------------------------------------------------------------
-- Una sola invitación pendiente por organización y correo. Reenviar revoca la anterior y crea otra.
CREATE UNIQUE INDEX invitation_one_pending ON iam.invitation (organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
