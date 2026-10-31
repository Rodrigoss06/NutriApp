-- P12 · Texto de consentimiento de imágenes (RN-B01, 07 §4, ADR-075): la evidencia de la postura y las pruebas físicas lo exige
-- y no había ninguno que otorgar. Texto de la plataforma, versión 0.1-provisional, pendiente de revisión legal: el del abogado
-- del cliente entra como versión nueva. Idempotente.
INSERT INTO clinical.consent_document (id, organization_id, purpose, version, body_markdown, sha256, published_at)
SELECT d.id, NULL, d.purpose, '0.1-provisional', d.body, sha256(convert_to(d.body, 'UTF8')), now()
FROM (VALUES
  ('01926000-0000-7000-8000-000000000003'::uuid, 'IMAGES',
   E'**Texto provisional, pendiente de revisión legal.**\n\n'
   'Autorizo a la organización que me atiende a guardar fotos, documentos y enlaces a videos de mis evaluaciones '
   'posturales y pruebas físicas, con la finalidad de revisar mi técnica y hacer su seguimiento. Los ve el equipo de '
   'atención de la organización que me atiende, conforme a la Ley 29733 de Protección de Datos Personales.\n\n'
   'Puedo revocar esta autorización en cualquier momento. Revocarla impide guardar evidencia nueva; la ya registrada '
   'se conserva en solo lectura hasta que pida su supresión.')
) AS d(id, purpose, body)
ON CONFLICT DO NOTHING;
