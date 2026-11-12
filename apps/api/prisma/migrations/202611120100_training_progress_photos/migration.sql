-- P14.5 (PR 6b-1) · Las fotos de progreso (P-30, respuestas de Rodrigo del 2026-11-10, 2026-11-11 y 2026-11-12; RN-B01, RN-G20;
-- ADR-119): tres vistas, frontal, lateral y posterior, por cada mesociclo del programa, desde su última semana. Las suben el alumno
-- y el coach. Con su consentimiento propio, PROGRESS_PHOTOS, con el texto del abogado del cliente. Se conservan solo mientras el
-- expediente esté activo: se borran al archivar al alumno o cuando revoca el consentimiento. Fuera del contrato: cotización de la
-- fase C por la cláusula décimo segunda.

-- PROGRESS_PHOTOS: finalidad opcional, con el texto del abogado (versión 1.0). La otorga el alumno desde su app o el coach en
-- consulta; revocarla borra las fotos.
ALTER TABLE clinical.consent
  DROP CONSTRAINT consent_purpose_check,
  ADD CONSTRAINT consent_purpose_check
    CHECK (purpose IN ('HEALTH_DATA','APP_ACCESS','IMAGES','ANONYMIZED_RESEARCH','MARKETING','MENSTRUAL_TRACKING',
                       'PROGRESS_PHOTOS'));

INSERT INTO clinical.consent_document (id, organization_id, purpose, version, body_markdown, sha256, published_at)
SELECT d.id, NULL, d.purpose, '1.0', d.body, sha256(convert_to(d.body, 'UTF8')), now()
FROM (VALUES
  ('01926000-0000-7000-8000-000000000005'::uuid, 'PROGRESS_PHOTOS',
   'Autorizo de manera libre, previa y expresa la carga, almacenamiento y visualización de mis fotografías corporales de '
   'progreso en la plataforma, con la única finalidad de que mi entrenador realice el seguimiento de mi evolución física. '
   'Estas imágenes son estrictamente confidenciales, no se compartirán con terceros ni se usarán con fines comerciales, y se '
   'conservarán únicamente mientras mi expediente esté activo o hasta que revoque este consentimiento.')
) AS d(id, purpose, body)
ON CONFLICT DO NOTHING;

-- Una foto por vista y por mesociclo de la línea del programa; subir otra la reemplaza y el archivo anterior se borra.
CREATE TABLE training.progress_photo (
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  patient_id          uuid NOT NULL,
  program_lineage_id  uuid NOT NULL,
  mesocycle_position  smallint NOT NULL CHECK (mesocycle_position >= 1),
  view                text NOT NULL CHECK (view IN ('FRONT','SIDE','BACK')),
  file_id             uuid NOT NULL REFERENCES platform.file_object(id),
  uploaded_by         uuid NOT NULL,                       -- el usuario: el alumno o un miembro del equipo
  uploaded_by_role    text NOT NULL CHECK (uploaded_by_role IN ('PATIENT','STAFF')),
  uploaded_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_lineage_id, mesocycle_position, view)
);
CREATE INDEX progress_photo_by_patient ON training.progress_photo (organization_id, patient_id);

SELECT app.enable_tenant_rls('training.progress_photo');
SELECT app.restrict_platform_admin('training.progress_photo');
SELECT app.enable_care_team_scope('training.progress_photo');
SELECT app.restrict_account('training.progress_photo');
SELECT app.restrict_patient('training.progress_photo', 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');

-- Reemplazar cambia el archivo y quién lo subió; borrar es lo que hacen el archivo del alumno y la revocación.
REVOKE UPDATE ON training.progress_photo FROM app_user;
GRANT UPDATE (file_id, uploaded_by, uploaded_by_role, uploaded_at) ON training.progress_photo TO app_user;
GRANT DELETE ON training.progress_photo TO app_user;

-- El alumno sube y lee sus fotos: además de lo que ya leía (sus fichas, sus recursos y la marca), los archivos de sus fotos, y
-- escribe solo archivos de fotos: los que sube y los de sus fotos, para marcar borrado el que reemplaza.
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
              WHERE p.file_id = file_object.id AND p.patient_id = app.patient_id())',
  'purpose = ''PROGRESS_PHOTO'' AND (
     uploaded_by = app.user_id()
     OR EXISTS (SELECT 1 FROM training.progress_photo p
                WHERE p.file_id = file_object.id AND p.patient_id = app.patient_id()))');
