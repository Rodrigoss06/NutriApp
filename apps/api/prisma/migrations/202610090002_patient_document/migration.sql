-- P6 · Documento único por organización con el equipo de atención en la base (RN-A05).
-- Quien no ve a un paciente tampoco ve que su documento ya existe, y el índice único abortaría la transacción. Esta
-- función solo responde sí o no, dentro de la organización del contexto, por el índice ciego (nunca el número).
CREATE FUNCTION app.patient_document_taken(p_bidx bytea, p_except uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clinical.patient
    WHERE organization_id = app.org_id() AND document_number_bidx = p_bidx
      AND (p_except IS NULL OR id <> p_except)
  )
$$;

GRANT EXECUTE ON FUNCTION app.patient_document_taken(bytea, uuid) TO app_user;
