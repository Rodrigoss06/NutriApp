-- P14.5 (PR 9b) · La propuesta con las sesiones de la hoja piloto de JV Fitness (P-34, respuesta de Jeremy del 2026-11-10 y
-- decisiones de Rodrigo del 2026-11-11; RN-F14; ADR-112): la flexión y la extensión de rodilla como patrones, y la división de
-- 5 días, superior e inferior con acondicionamiento. PUSH_PULL_LEGS queda para los programas que ya la guardaron. Los ejercicios
-- de rodilla y su fila de la tabla patrón × nivel los carga catalog:load desde seeds/exercise.
INSERT INTO exercise.movement_pattern (code, name_es, display_order) VALUES
  ('KNEE_FLEXION', 'Flexión de rodilla', 19),
  ('KNEE_EXTENSION', 'Extensión de rodilla', 20);

ALTER TABLE training.program
  DROP CONSTRAINT program_split_check,
  ADD CONSTRAINT program_split_check
    CHECK (split IN ('FULL_BODY','FULL_BODY_ABC','UPPER_LOWER','UPPER_LOWER_CONDITIONING','PUSH_PULL_LEGS'));
