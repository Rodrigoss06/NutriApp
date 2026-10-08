import type { MailMessage } from '../../../../../platform/index.js';

/** Textos de los correos de cuenta, en español. Sin seguimiento ni imágenes remotas. */
export function passwordResetMail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Crea una nueva contraseña',
    text: [
      `Hola, ${name}:`,
      '',
      'Pediste crear una nueva contraseña. Abre este enlace en la próxima hora:',
      link,
      '',
      'Si no lo pediste, ignora este correo: tu contraseña sigue igual.',
    ].join('\n'),
  };
}

export function passwordChangedMail(
  to: string,
  name: string,
  reason: 'CHANGED' | 'RESET',
  recoverLink: string,
): MailMessage {
  const how = reason === 'RESET' ? 'con un enlace de recuperación' : 'desde tu cuenta';
  return {
    to,
    subject: 'Tu contraseña cambió',
    text: [
      `Hola, ${name}:`,
      '',
      `Tu contraseña se cambió ${how} y cerramos tus sesiones abiertas.`,
      '',
      `Si no fuiste tú, crea una nueva contraseña ahora: ${recoverLink}`,
    ].join('\n'),
  };
}

const ROLE_NAMES: Readonly<Record<string, string>> = {
  OWNER: 'dueño',
  ADMIN: 'administrador',
  PROFESSIONAL: 'profesional',
};

export function invitationMail(
  to: string,
  organizationName: string,
  role: string,
  link: string,
  expiresAt: Date,
): MailMessage {
  const until = expiresAt.toLocaleDateString('es-PE', {
    dateStyle: 'long',
    timeZone: 'America/Lima',
  });
  return {
    to,
    subject: `Te invitaron a ${organizationName}`,
    text: [
      'Hola:',
      '',
      `Te invitaron a unirte a ${organizationName} como ${ROLE_NAMES[role] ?? role}. Abre este enlace para aceptar:`,
      link,
      '',
      `El enlace vale hasta el ${until} y solo funciona una vez.`,
      'Si no esperabas esta invitación, ignora este correo.',
    ].join('\n'),
  };
}

export function platformWelcomeMail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Crea tu contraseña de administración',
    text: [
      `Hola, ${name}:`,
      '',
      'Se creó tu cuenta de administración de la plataforma. Crea tu contraseña en las próximas 24 horas:',
      link,
      '',
      'Si no esperabas este correo, avísanos respondiendo a este mensaje.',
    ].join('\n'),
  };
}
