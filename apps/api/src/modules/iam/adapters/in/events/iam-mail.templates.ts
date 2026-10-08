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
