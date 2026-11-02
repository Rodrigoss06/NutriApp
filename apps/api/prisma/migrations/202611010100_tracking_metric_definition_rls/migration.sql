-- P13 (PR 2) · tracking.metric_definition es un catálogo global sin organization_id y no tenía RLS: cualquier sesión podía
-- agregar o cambiar métricas para todas las organizaciones. Como los demás catálogos globales (ADR-052): todos leen y solo
-- SYSTEM inserta o actualiza.
SELECT app.enable_global_rls('tracking.metric_definition');
