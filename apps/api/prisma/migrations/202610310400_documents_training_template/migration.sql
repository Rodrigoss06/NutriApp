-- P12 · La ficha de la rutina 1.0.0 (RN-H01, ADR-079): se genera al publicar un programa y a pedido, desde su snapshot. El
-- dibujo está en el código de la API (documents/adapters/out/pdf/training.v1.ts); layout describe sus secciones.
INSERT INTO documents.template (id, organization_id, kind, version, layout) VALUES
  ('019a1c00-0000-7000-8000-000000000005', NULL, 'TRAINING', '1.0.0',
   '{"page": "A4", "sections": ["brand", "patient", "program", "macrocycle", "weeks", "exercises", "contact"]}');
