-- P14 · Material educativo (RF-30, ADR-094): la biblioteca de la organización, su asignación a pacientes y la vista en la app.
-- Las tablas existen desde P2 (05.3), vacías. Esta migración solo agrega: lo que cada tipo exige, los índices de sus consultas,
-- quitar una asignación y que el paciente marque lo que abrió.

-- Cada tipo con su contenido: el archivo (PDF), el enlace o el video por URL, el artículo con su texto.
ALTER TABLE content.educational_resource
  ADD CONSTRAINT educational_resource_status CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT educational_resource_kind_content CHECK (
    (kind = 'FILE' AND file_id IS NOT NULL AND url IS NULL AND body_markdown IS NULL)
    OR (kind IN ('LINK', 'VIDEO') AND url IS NOT NULL AND file_id IS NULL AND body_markdown IS NULL)
    OR (kind = 'ARTICLE' AND body_markdown IS NOT NULL AND file_id IS NULL AND url IS NULL));

CREATE INDEX educational_resource_by_org ON content.educational_resource (organization_id, status, created_at DESC);
CREATE INDEX resource_assignment_by_patient ON content.resource_assignment (patient_id, assigned_at DESC);

-- Quitar un recurso asignado por error: la fila de la asignación se borra; el recurso sigue en la biblioteca. Lo quita su equipo
-- de atención; el paciente lee sus asignaciones, pero no las borra (DELETE no pasa por el WITH CHECK de patient_scope).
GRANT DELETE ON content.resource_assignment TO app_user;
CREATE POLICY patient_no_delete ON content.resource_assignment AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');

-- El paciente marca que abrió un recurso (ADR-086): su RLS no le deja escribir la asignación, y una política de escritura le
-- dejaría cambiar cualquier columna. Esta función solo pone viewed_at, una vez, en una asignación suya.
CREATE FUNCTION app.mark_resource_viewed(p_resource_id uuid)
RETURNS boolean
LANGUAGE sql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH marked AS (
    UPDATE content.resource_assignment a SET viewed_at = now()
    WHERE app.role() = 'PATIENT' AND app.patient_id() IS NOT NULL AND app.org_id() IS NOT NULL
      AND a.patient_id = app.patient_id() AND a.organization_id = app.org_id()
      AND a.resource_id = p_resource_id AND a.viewed_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM marked)
$$;
REVOKE ALL ON FUNCTION app.mark_resource_viewed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mark_resource_viewed(uuid) TO app_user;
