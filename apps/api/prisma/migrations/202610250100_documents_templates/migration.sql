-- P11 (PR 2) · Las fichas del menú y de resultados antropométricos (RF-24, RN-H01, ADR-065), globales. El menú también
-- imprime la dieta por composición, como un plan de un día. El dibujo está en el código de la API
-- (documents/adapters/out/pdf); layout describe sus secciones.
INSERT INTO documents.template (id, organization_id, kind, version, layout) VALUES
  ('019a1c00-0000-7000-8000-000000000002', NULL, 'WEEKLY_MENU', '1.0.0',
   '{"page": "A4", "sections": ["brand", "patient", "targets", "hydration", "days", "average", "recipes", "instructions", "contact"]}'),
  ('019a1c00-0000-7000-8000-000000000003', NULL, 'ANTHROPOMETRY', '1.0.0',
   '{"page": "A4", "sections": ["brand", "patient", "conditions", "results", "sites", "bia", "contact"]}');
