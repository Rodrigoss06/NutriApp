-- P11 · La ficha de resultados antropométricos 1.0.1 (ADR-069): el método ya no repite el indicador cuando su nombre lo
-- lleva («Masa ósea (Rocha)», no «Masa ósea (Masa ósea (Rocha))»). La 1.0.0 queda retirada: el código la sigue
-- dibujando para volver a generar lo que ya se generó con ella (RN-H02). Una sola activa por tipo (template_one_active).
UPDATE documents.template SET status = 'RETIRED'
WHERE organization_id IS NULL AND kind = 'ANTHROPOMETRY' AND version = '1.0.0';

INSERT INTO documents.template (id, organization_id, kind, version, layout) VALUES
  ('019a1c00-0000-7000-8000-000000000004', NULL, 'ANTHROPOMETRY', '1.0.1',
   '{"page": "A4", "sections": ["brand", "patient", "conditions", "results", "sites", "bia", "contact"]}');
