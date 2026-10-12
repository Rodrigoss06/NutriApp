import { domainError } from '@nutricoach/shared-kernel';

/**
 * Todo enlace de invitación que ya no sirve responde igual (410): vencido, usado o revocado y, si es de un paciente,
 * también con el paciente archivado o ya vinculado. Así el enlace no revela la causa.
 */
export const INVALID_INVITATION = domainError({
  code: 'NC-IAM-040',
  message: 'La invitación venció, ya se usó o fue anulada. Pide una nueva a quien te invitó.',
});

/** En la versión 1.0 una cuenta se vincula a un solo paciente: un correo con cuenta (staff, plataforma u otro paciente) no sirve. */
export const ACCOUNT_EXISTS_FOR_PATIENT = domainError({
  code: 'NC-IAM-044',
  message: 'Ese correo ya tiene una cuenta. Usa otro correo para el acceso del paciente a la app.',
});

/** Una invitación pendiente por correo y organización: la de un paciente y la de staff no se pisan. */
export const EMAIL_HAS_PENDING_INVITATION = domainError({
  code: 'NC-IAM-045',
  message: 'Ese correo tiene otra invitación pendiente en la organización.',
});
