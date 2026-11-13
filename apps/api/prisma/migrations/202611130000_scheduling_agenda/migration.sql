-- P15 · PR 1 · la agenda por la API (RF-37; RN-J01 a RN-J03; ADR-125). Las tablas son de 0010; aquí, lo que la API acepta,
-- los índices de sus consultas y lo que app_user puede cambiar.

-- Lo que valida la API, también en la base: el enlace externo solo https (P-32), los largos y una cita de hasta 12 horas.
ALTER TABLE scheduling.appointment
  ADD CONSTRAINT appointment_meeting_url CHECK (
    meeting_url IS NULL OR (meeting_url ~ '^https://' AND char_length(meeting_url) <= 2000)),
  ADD CONSTRAINT appointment_location_length CHECK (
    location IS NULL OR char_length(location) BETWEEN 1 AND 200),
  ADD CONSTRAINT appointment_notes_length CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  ADD CONSTRAINT appointment_max_duration CHECK (ends_at - starts_at <= interval '12 hours'),
  ADD CONSTRAINT appointment_version CHECK (version >= 0);

-- Las citas de un paciente (su expediente, su app y la próxima en el panel) y las confirmadas que esperan su recordatorio (RN-J02).
CREATE INDEX appointment_by_patient ON scheduling.appointment (organization_id, patient_id, starts_at)
  WHERE patient_id IS NOT NULL;
CREATE INDEX appointment_reminder_due ON scheduling.appointment (organization_id, starts_at)
  WHERE status = 'CONFIRMED' AND reminder_sent_at IS NULL;

-- Una cita no se borra: se cancela. UPDATE solo de lo que cambia; quién la creó, para quién y su profesional no cambian.
REVOKE UPDATE ON scheduling.appointment FROM app_user;
GRANT UPDATE (kind, mode, location, meeting_url, starts_at, ends_at, status, notes, reminder_sent_at, updated_at, version)
  ON scheduling.appointment TO app_user;

-- La disponibilidad semanal se reemplaza entera (DELETE concedido en 0010).
ALTER TABLE scheduling.availability
  ADD CONSTRAINT availability_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from);
CREATE INDEX availability_by_member ON scheduling.availability (organization_id, member_id, day_of_week);
