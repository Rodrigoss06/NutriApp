-- P14.5 (PR 8a) · El expediente de documentos del alumno (P-31, respuesta de Rodrigo del 2026-11-10; plan aprobado el 2026-11-12;
-- RN-A05, RN-B01, RN-B03; ADR-122): enlaces externos y archivos PDF, JPEG o PNG de hasta 5 MB (ADR-038); los videos, siempre por
-- enlace. Ocho categorías fijas y tres estados. Fuera del contrato: cotización de la fase C por la cláusula décimo segunda.

-- Un documento del expediente. El coach pide uno sin contenido («Pendiente») o agrega uno con su archivo o enlace («Validado»); el
-- alumno completa un pedido o sube uno nuevo («Por revisar»), y el coach lo valida o lo devuelve a «Pendiente» con una nota. El
-- contenido es un enlace https o un archivo, nunca los dos. Borrar es lógico: el archivo se borra, el enlace se vacía y la fila
-- queda oculta, con quién la borró y cuándo.
CREATE TABLE clinical.record_document (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL,
  patient_id       uuid NOT NULL REFERENCES clinical.patient(id),
  category         text NOT NULL CHECK (category IN ('ADMINISTRATIVE','CLINICAL','PROGRESS','APECS_EVALUATION','TECHNIQUE',
                                                     'FOLLOW_UP','PHYSICAL_EVALUATIONS','REPORT')),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  status           text NOT NULL CHECK (status IN ('PENDING','IN_REVIEW','VALIDATED')),
  link_url         text CHECK (link_url ~ '^https://' AND char_length(link_url) <= 2000),
  file_id          uuid REFERENCES platform.file_object(id),
  review_note      text CHECK (char_length(review_note) BETWEEN 1 AND 500),
  created_by       uuid NOT NULL,                        -- el usuario: el alumno o un miembro del equipo
  created_by_role  text NOT NULL CHECK (created_by_role IN ('PATIENT','STAFF')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  content_by       uuid,                                 -- quién puso el contenido vigente
  content_by_role  text CHECK (content_by_role IN ('PATIENT','STAFF')),
  content_at       timestamptz,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  deleted_by       uuid,
  deleted_at       timestamptz,
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (link_url IS NULL OR file_id IS NULL),
  -- Sin contenido solo puede estar «Pendiente» (o borrado).
  CHECK (deleted_at IS NOT NULL OR status = 'PENDING' OR link_url IS NOT NULL OR file_id IS NOT NULL),
  CHECK ((content_by IS NULL) = (content_by_role IS NULL) AND (content_by IS NULL) = (content_at IS NULL)),
  CHECK ((deleted_by IS NULL) = (deleted_at IS NULL))
);
CREATE INDEX record_document_by_patient ON clinical.record_document (organization_id, patient_id, created_at)
  WHERE deleted_at IS NULL;

SELECT app.enable_tenant_rls('clinical.record_document');
SELECT app.restrict_platform_admin('clinical.record_document');
SELECT app.enable_care_team_scope('clinical.record_document');
SELECT app.restrict_account('clinical.record_document');
SELECT app.restrict_patient('clinical.record_document', 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');

-- El alumno sube los suyos «Por revisar» y nunca valida: lo decide el caso de uso, y la base lo asegura.
CREATE POLICY patient_adds_for_review ON clinical.record_document AS RESTRICTIVE FOR INSERT
  WITH CHECK (app.role() IS DISTINCT FROM 'PATIENT' OR (status = 'IN_REVIEW' AND created_by_role = 'PATIENT'));
CREATE POLICY patient_never_validates ON clinical.record_document AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (app.role() IS DISTINCT FROM 'PATIENT' OR status <> 'VALIDATED');

-- Se cambian el estado, el contenido, la revisión y el borrado; lo demás queda como se creó. Nadie borra filas.
REVOKE UPDATE ON clinical.record_document FROM app_user;
GRANT UPDATE (status, link_url, file_id, review_note, content_by, content_by_role, content_at, reviewed_by, reviewed_at,
              deleted_by, deleted_at, version) ON clinical.record_document TO app_user;

-- El alumno lee y sube los archivos de sus documentos, como los de sus fotos: además de lo que ya leía, los de su expediente; y
-- escribe solo archivos de fotos o de documentos, los que sube y los de los suyos, para marcar borrado el que reemplaza o borra.
DROP POLICY patient_scope ON platform.file_object;
SELECT app.restrict_patient('platform.file_object',
  'EXISTS (SELECT 1 FROM documents.generated_document d
           WHERE d.file_id = file_object.id AND d.patient_id = app.patient_id())
   OR EXISTS (SELECT 1 FROM content.educational_resource r
              JOIN content.resource_assignment a ON a.resource_id = r.id
              WHERE r.file_id = file_object.id AND a.patient_id = app.patient_id())
   OR EXISTS (SELECT 1 FROM tenancy.branding b
              WHERE file_object.id IN (b.logo_file_id, b.avatar_file_id))
   OR EXISTS (SELECT 1 FROM training.progress_photo p
              WHERE p.file_id = file_object.id AND p.patient_id = app.patient_id())
   OR EXISTS (SELECT 1 FROM clinical.record_document rd
              WHERE rd.file_id = file_object.id AND rd.patient_id = app.patient_id())',
  '(purpose = ''PROGRESS_PHOTO'' AND (
      uploaded_by = app.user_id()
      OR EXISTS (SELECT 1 FROM training.progress_photo p
                 WHERE p.file_id = file_object.id AND p.patient_id = app.patient_id())))
   OR (purpose = ''RECORD_DOCUMENT'' AND (
      uploaded_by = app.user_id()
      OR EXISTS (SELECT 1 FROM clinical.record_document rd
                 WHERE rd.file_id = file_object.id AND rd.patient_id = app.patient_id())))');
