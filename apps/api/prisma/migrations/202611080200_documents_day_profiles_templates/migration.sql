-- P14.5 (PR 1d) · Las fichas del plan 1.1.0 (RN-H01, ADR-101): la dieta por intercambios y el menú semanal, que imprime también la
-- composición, muestran la meta de cada perfil de día (07 §2, P-20) debajo de las metas del día. La 1.0.0 queda retirada: el
-- código la sigue dibujando para volver a generar lo que ya se generó con ella (RN-H02). Una sola activa por tipo
-- (template_one_active).
UPDATE documents.template SET status = 'RETIRED'
WHERE organization_id IS NULL AND kind IN ('EXCHANGE_DIET', 'WEEKLY_MENU') AND version = '1.0.0';

INSERT INTO documents.template (id, organization_id, kind, version, layout) VALUES
  ('019a1c00-0000-7000-8000-000000000007', NULL, 'EXCHANGE_DIET', '1.1.0',
   '{"page": "A4", "sections": ["brand", "patient", "targets", "day_profiles", "hydration", "exchanges", "meals", "instructions", "contact"]}'),
  ('019a1c00-0000-7000-8000-000000000008', NULL, 'WEEKLY_MENU', '1.1.0',
   '{"page": "A4", "sections": ["brand", "patient", "targets", "day_profiles", "hydration", "days", "average", "recipes", "instructions", "contact"]}');
