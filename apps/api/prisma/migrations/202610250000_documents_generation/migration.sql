-- P11 · Fichas PDF (RF-24, RN-H02, ADR-064): una ficha se genera desde un snapshot publicado o una evaluación cerrada y
-- guarda la versión de su plantilla, el hash de lo que muestra y el de la marca. Con los tres iguales, es el mismo PDF:
-- se reutiliza en vez de generarse otra vez.

-- Plantillas ---------------------------------------------------------------------------------------------------------
ALTER TABLE documents.template
  ADD CONSTRAINT template_status CHECK (status IN ('ACTIVE', 'RETIRED'));

-- Una sola versión activa por tipo y alcance: la que usa una ficha nueva. Las retiradas quedan para saber con qué
-- plantilla se hizo cada ficha.
CREATE UNIQUE INDEX template_one_active ON documents.template (organization_id, kind) NULLS NOT DISTINCT
  WHERE status = 'ACTIVE';

-- La versión 1.0.0 de la ficha de la dieta por intercambios, global. El dibujo está en el código de la API
-- (documents/adapters/out/pdf); layout describe sus secciones.
INSERT INTO documents.template (id, organization_id, kind, version, layout) VALUES
  ('019a1c00-0000-7000-8000-000000000001', NULL, 'EXCHANGE_DIET', '1.0.0',
   '{"page": "A4", "sections": ["brand", "patient", "targets", "hydration", "exchanges", "meals", "instructions", "contact"]}');

-- Fichas generadas ---------------------------------------------------------------------------------------------------
ALTER TABLE documents.generated_document
  ADD CONSTRAINT generated_document_kind
    CHECK (kind IN ('EXCHANGE_DIET', 'WEEKLY_MENU', 'ANTHROPOMETRY', 'EVOLUTION', 'TRAINING')),
  ADD CONSTRAINT generated_document_source_type
    CHECK (source_type IN ('NUTRITION_PLAN', 'EVALUATION', 'TRAINING_PROGRAM'));

-- Reutilizar (RN-H02): el mismo origen con el mismo contenido, plantilla y marca es el mismo PDF. Si dos trabajos lo
-- generan a la vez, el segundo choca aquí y descarta su archivo.
CREATE UNIQUE INDEX generated_document_reuse ON documents.generated_document
  (organization_id, kind, source_type, source_id, source_hash, template_version, branding_hash);

-- Las fichas de un paciente, de la más reciente a la más antigua.
CREATE INDEX generated_document_by_patient ON documents.generated_document
  (organization_id, patient_id, generated_at DESC);
