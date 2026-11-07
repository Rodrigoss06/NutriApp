-- P14 · La ficha de evolución 1.0.0 (RN-H01, ADR-091): se genera a pedido desde la última evaluación cerrada del paciente, con
-- todas las anteriores. El dibujo está en el código de la API (documents/adapters/out/pdf/evolution.v1.ts); layout describe sus
-- secciones.
INSERT INTO documents.template (id, organization_id, kind, version, layout) VALUES
  ('019a1c00-0000-7000-8000-000000000006', NULL, 'EVOLUTION', '1.0.0',
   '{"page": "A4", "sections": ["brand", "patient", "evaluations", "measurements", "methods", "bia", "contact"]}');
