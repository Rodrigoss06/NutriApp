/** Un correo transaccional: invitaciones, recuperación y avisos de seguridad. */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/** Envío de correo (Notion Documento técnico §1): SMTP en local (Mailpit) y Resend en staging y producción. */
export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol.for('nutricoach.Mailer');
