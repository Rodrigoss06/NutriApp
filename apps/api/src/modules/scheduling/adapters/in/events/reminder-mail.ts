import type { MailMessage } from '../../../../../platform/index.js';
import type { AppointmentRecord } from '../../../domain/appointment.js';

const KIND_NAMES: Readonly<Record<AppointmentRecord['kind'], string>> = {
  CONSULTATION: 'consulta',
  FOLLOW_UP: 'control',
  EVALUATION: 'evaluación',
  TRAINING: 'sesión de entrenamiento',
  OTHER: 'cita',
};

/**
 * El recordatorio de una cita confirmada (RN-J02), con la fecha y la hora en la zona de la organización (RN-J03). Sin la nota del
 * profesional ni datos de salud; sin seguimiento ni imágenes remotas.
 */
export function reminderMail(
  to: string,
  firstName: string,
  organizationName: string,
  appointment: Pick<AppointmentRecord, 'kind' | 'mode' | 'startsAt' | 'location' | 'meetingUrl'>,
  timeZone: string,
): MailMessage {
  const when = appointment.startsAt.toLocaleString('es-PE', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  });
  const where =
    appointment.mode === 'VIRTUAL'
      ? appointment.meetingUrl
        ? `Es virtual. Entra con este enlace: ${appointment.meetingUrl}`
        : 'Es virtual: tu profesional te enviará el enlace.'
      : appointment.location
        ? `Es presencial, en ${appointment.location}.`
        : 'Es presencial.';
  return {
    to,
    subject: `Recordatorio: tu ${KIND_NAMES[appointment.kind]} con ${organizationName}`,
    text: [
      `Hola, ${firstName}:`,
      '',
      `Te recordamos tu ${KIND_NAMES[appointment.kind]} con ${organizationName} el ${when}.`,
      where,
      '',
      'Si no puedes asistir, avisa a tu profesional.',
    ].join('\n'),
  };
}
