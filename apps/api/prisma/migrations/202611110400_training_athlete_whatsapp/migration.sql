-- P14.5 (PR 9d) · «Seguimiento asistido por WhatsApp» (P-35, respuesta de Jeremy del 2026-11-10; decisiones de Rodrigo del
-- 2026-11-11; ADR-116). Es una modalidad de acompañamiento por alumno: se activa en su perfil de entrenamiento, que es por
-- revisiones, y la revisión nueva la copia como el resto del perfil. Las revisiones que ya existen quedan sin activar.
ALTER TABLE training.athlete_profile
  ADD COLUMN whatsapp_follow_up boolean NOT NULL DEFAULT false;
