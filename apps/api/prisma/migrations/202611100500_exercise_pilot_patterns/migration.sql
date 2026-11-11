-- P14.5 (PR 9a) · Los patrones y los equipos nuevos de la prescripción de la hoja piloto de JV Fitness (P-34, respuesta de Jeremy
-- del 2026-11-10; RN-F11, RN-F14; ADR-111). Sus ejercicios y su fila de la tabla patrón × nivel los carga catalog:load desde
-- seeds/exercise, como los de la V3. Los 15 patrones de la V3 no cambian.
INSERT INTO exercise.movement_pattern (code, name_es, display_order) VALUES
  ('SHOULDER_MOBILITY', 'Movilidad de hombro', 16),
  ('THORACIC_MOBILITY', 'Movilidad torácica', 17),
  ('LUMBAR_STABILITY', 'Estabilidad lumbar', 18);

INSERT INTO exercise.equipment (code, name_es) VALUES
  ('FOAM_ROLLER', 'Rodillo de espuma'),
  ('AIR_BIKE', 'Bicicleta de aire');
