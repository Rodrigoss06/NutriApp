-- P13 (PR 5) · Los ajustes del profesional y las notas leídas (RN-G01, RN-G02, RN-G13; ADR-085).

-- RN-G02: un ajuste nunca se edita; corregirlo es otro ajuste, y el más reciente de cada registro es el que vale. app_user nace
-- con UPDATE: se le quita. DELETE nunca lo tuvo.
REVOKE UPDATE ON tracking.log_adjustment FROM app_user;

-- Excluir no lleva valores; corregir, sí (ADR-085).
ALTER TABLE tracking.log_adjustment
  ADD CONSTRAINT log_adjustment_values_check CHECK (
    (action = 'EXCLUDE' AND corrected_values IS NULL)
    OR (action = 'CORRECT' AND corrected_values IS NOT NULL)
  );

-- RN-G13: las notas sin leer de un paciente, para el panel. read_by es el miembro del equipo que la abrió.
CREATE INDEX note_log_unread ON tracking.note_log (patient_id, created_at) WHERE read_at IS NULL;
