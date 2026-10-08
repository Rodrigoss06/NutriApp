import { createTransport, type Transporter } from 'nodemailer';
import { LOCAL_MAIL_FROM, loadEnv, type Env } from '../config/env.js';
import type { MailerPort, MailMessage } from './mailer.port.js';

/** SMTP: Mailpit en local y en CI, donde el E2E lee los enlaces de su API. */
export class SmtpMailer implements MailerPort {
  readonly #transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.#transport = createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.#transport.sendMail({ from: this.from, ...message });
  }
}

/**
 * Resend por su API HTTP. El seguimiento de clics queda apagado en el dominio de Resend: reescribiría los enlaces y
 * el token de invitación o recuperación pasaría por sus servidores (ADR-032).
 */
export class ResendMailer implements MailerPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, ...message }),
    });
    if (!response.ok) {
      // Sin el cuerpo de la respuesta: podría repetir el destinatario. El trabajo se reintenta.
      throw new Error(`Resend respondió ${String(response.status)}`);
    }
  }
}

export function createMailer(env: Env = loadEnv()): MailerPort {
  if (env.MAIL_DRIVER === 'resend') {
    return new ResendMailer(env.RESEND_API_KEY ?? '', env.MAIL_FROM ?? '');
  }
  return new SmtpMailer(env.SMTP_URL ?? '', env.MAIL_FROM ?? LOCAL_MAIL_FROM);
}
