import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../config/env.js';
import { createMailer, ResendMailer, SmtpMailer } from './mailers.js';

describe('MailerPort · SMTP en local y Resend en staging y producción', () => {
  it('elige el adaptador por MAIL_DRIVER', () => {
    expect(createMailer(loadEnv())).toBeInstanceOf(SmtpMailer);
    expect(
      createMailer(
        loadEnv({
          ...process.env,
          MAIL_DRIVER: 'resend',
          RESEND_API_KEY: 're_x',
          MAIL_FROM: 'A <a@b.pe>',
        }),
      ),
    ).toBeInstanceOf(ResendMailer);
  });

  it('Resend recibe remitente, destinatario y textos; un error no repite el destinatario', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    const mailer = new ResendMailer('re_key', 'NutriCoach <no-responder@x.pe>', fetchImpl);

    await mailer.send({ to: 'ana@demo.test', subject: 'Hola', text: 'Texto' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'NutriCoach <no-responder@x.pe>',
      to: 'ana@demo.test',
      subject: 'Hola',
      text: 'Texto',
    });

    const failing = new ResendMailer('re_key', 'x', () =>
      Promise.resolve(new Response('', { status: 500 })),
    );
    await expect(failing.send({ to: 'ana@demo.test', subject: 's', text: 't' })).rejects.toThrow(
      /^Resend respondió 500$/,
    );
  });
});
