-- P15 · PR 5a · la exportación del paciente (RF-07, RN-B04, RN-B03; plan aprobado el 2026-11-13, ADR-124; ADR-131): la piden el
-- responsable, el dueño o el propio paciente; el worker arma un ZIP con JSON, CSV, las fichas y los archivos, y queda 24 horas para
-- descargarlo con sesión, solo quien lo pidió.

-- Cada archivo del paciente lleva su id: así la exportación los encuentra todos, también la evidencia que quedó sin ruta al quitarla
-- de un borrador (ADR-075), y la supresión (PR 6) los borra todos. Los logos, la marca, el material y las importaciones no son de un
-- paciente y quedan en NULL. Lo que ya existe se completa desde las filas que lo nombran.
ALTER TABLE platform.file_object ADD COLUMN patient_id uuid;
UPDATE platform.file_object f
SET patient_id = refs.patient_id
FROM (
  SELECT DISTINCT ON (file_id) file_id, patient_id
  FROM (
    SELECT file_id, patient_id FROM documents.generated_document
    UNION ALL SELECT file_id, patient_id FROM clinical.record_document WHERE file_id IS NOT NULL
    UNION ALL SELECT file_id, patient_id FROM training.progress_photo WHERE file_id IS NOT NULL
    UNION ALL SELECT evidence_file_id, patient_id FROM clinical.consent WHERE evidence_file_id IS NOT NULL
    UNION ALL SELECT evidence_file_id, patient_id FROM assessment.movement_screen WHERE evidence_file_id IS NOT NULL
    UNION ALL SELECT evidence_file_id, patient_id FROM assessment.physical_test_result WHERE evidence_file_id IS NOT NULL
  ) named
  ORDER BY file_id
) refs
WHERE f.id = refs.file_id;
CREATE INDEX file_object_by_patient ON platform.file_object (organization_id, patient_id) WHERE patient_id IS NOT NULL;
-- Como toda tabla con patient_id (RN-A05, ADR-037): los archivos de un paciente los ve quien ve al paciente. Quien acepta una
-- invitación (ACCOUNT) no lee ni escribe archivos.
SELECT app.enable_care_team_scope('platform.file_object');
SELECT app.restrict_account('platform.file_object');

-- Un pedido de exportación. PENDING mientras el worker la arma; READY con su archivo por 24 horas desde que quedó lista; EXPIRED
-- cuando el trabajo de cada hora borra el archivo; FAILED si no se pudo armar. requested_by_member es el miembro que la pidió: las
-- notas «Solo el autor» van solo en la exportación que pide su autor.
CREATE TABLE clinical.patient_export (
  id                   uuid PRIMARY KEY,
  organization_id      uuid NOT NULL,
  patient_id           uuid NOT NULL REFERENCES clinical.patient(id),
  requested_by         uuid NOT NULL,                       -- el usuario
  requested_by_role    text NOT NULL CHECK (requested_by_role IN ('STAFF','PATIENT')),
  requested_by_member  uuid,
  status               text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','EXPIRED','FAILED')),
  file_id              uuid REFERENCES platform.file_object(id),
  size_bytes           bigint CHECK (size_bytes > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  ready_at             timestamptz,
  expires_at           timestamptz,
  CHECK ((requested_by_role = 'STAFF') = (requested_by_member IS NOT NULL)),
  CHECK (CASE WHEN status IN ('READY','EXPIRED')
              THEN file_id IS NOT NULL AND size_bytes IS NOT NULL AND ready_at >= created_at
                   AND expires_at = ready_at + interval '24 hours'
              ELSE file_id IS NULL AND size_bytes IS NULL AND ready_at IS NULL AND expires_at IS NULL END)
);
CREATE INDEX patient_export_by_patient ON clinical.patient_export (organization_id, patient_id, created_at DESC);
CREATE INDEX patient_export_to_close ON clinical.patient_export (organization_id, status)
  WHERE status IN ('PENDING','READY');

SELECT app.enable_tenant_rls('clinical.patient_export');
SELECT app.restrict_platform_admin('clinical.patient_export');
SELECT app.enable_care_team_scope('clinical.patient_export');
SELECT app.restrict_account('clinical.patient_export');
SELECT app.restrict_patient('clinical.patient_export',
  'patient_id = app.patient_id() AND requested_by_role = ''PATIENT''',
  'patient_id = app.patient_id() AND requested_by_role = ''PATIENT'' AND requested_by = app.user_id()');

-- Cada uno pide a su nombre, y el pedido nace pendiente. Solo el worker lo completa.
CREATE POLICY requested_by_self ON clinical.patient_export AS RESTRICTIVE FOR INSERT
  WITH CHECK (requested_by = app.user_id() AND status = 'PENDING'
              AND (requested_by_role = 'PATIENT' OR requested_by_member = app.member_id()));
CREATE POLICY system_completes ON clinical.patient_export AS RESTRICTIVE FOR UPDATE
  USING (app.role() = 'SYSTEM')
  WITH CHECK (app.role() = 'SYSTEM');
REVOKE UPDATE ON clinical.patient_export FROM app_user;
GRANT UPDATE (status, file_id, size_bytes, ready_at, expires_at) ON clinical.patient_export TO app_user;

-- El paciente descarga el ZIP de las exportaciones que pidió él: además de lo que ya leía, ese archivo. Escribe lo mismo que antes,
-- y siempre con su id.
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
              WHERE rd.file_id = file_object.id AND rd.patient_id = app.patient_id())
   OR EXISTS (SELECT 1 FROM clinical.patient_export e
              WHERE e.file_id = file_object.id AND e.patient_id = app.patient_id()
                AND e.requested_by_role = ''PATIENT'')',
  'patient_id = app.patient_id() AND (
   (purpose = ''PROGRESS_PHOTO'' AND (
      uploaded_by = app.user_id()
      OR EXISTS (SELECT 1 FROM training.progress_photo p
                 WHERE p.file_id = file_object.id AND p.patient_id = app.patient_id())))
   OR (purpose = ''RECORD_DOCUMENT'' AND (
      uploaded_by = app.user_id()
      OR EXISTS (SELECT 1 FROM clinical.record_document rd
                 WHERE rd.file_id = file_object.id AND rd.patient_id = app.patient_id()))))');
