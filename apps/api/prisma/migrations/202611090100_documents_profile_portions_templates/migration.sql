-- P14.5 (PR 1f) · Las fichas del plan 1.2.0 (RN-H01, ADR-103): además de la meta de cada perfil de día (1.1.0), lo que cambia en
-- cada perfil (07 §2, P-20.5). La dieta por intercambios dice los almidones de cada tiempo en cada perfil; el menú semanal, que
-- imprime también la composición, cada alimento o receta con su cantidad en el plan y en cada perfil que la cambia. La 1.1.0
-- queda retirada: el código la sigue dibujando para volver a generar lo que ya se generó con ella (RN-H02). Una sola activa
-- por tipo (template_one_active).
UPDATE documents.template SET status = 'RETIRED'
WHERE organization_id IS NULL AND kind IN ('EXCHANGE_DIET', 'WEEKLY_MENU') AND version = '1.1.0';

INSERT INTO documents.template (id, organization_id, kind, version, layout) VALUES
  ('019a1c00-0000-7000-8000-000000000009', NULL, 'EXCHANGE_DIET', '1.2.0',
   '{"page": "A4", "sections": ["brand", "patient", "targets", "day_profiles", "hydration", "exchanges", "meals", "profile_portions", "instructions", "contact"]}'),
  ('019a1c00-0000-7000-8000-00000000000a', NULL, 'WEEKLY_MENU', '1.2.0',
   '{"page": "A4", "sections": ["brand", "patient", "targets", "day_profiles", "hydration", "days", "average", "profile_portions", "recipes", "instructions", "contact"]}');
