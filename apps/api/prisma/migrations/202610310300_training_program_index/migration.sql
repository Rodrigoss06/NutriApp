-- P12 · Listar los programas de un paciente, su fórmula de 1RM y su línea de tiempo no recorren toda la tabla (ADR-077).
CREATE INDEX program_by_patient ON training.program (organization_id, patient_id, created_at DESC);
