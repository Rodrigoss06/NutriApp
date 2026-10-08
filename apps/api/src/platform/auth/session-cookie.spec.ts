import type { Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

const ORIGINAL = process.env['APP_URL'];

function recorder() {
  const calls: { name: string; options: Record<string, unknown> }[] = [];
  const response = {
    cookie: (name: string, _value: string, options: Record<string, unknown>) =>
      calls.push({ name, options }),
    clearCookie: (name: string, options: Record<string, unknown>) => calls.push({ name, options }),
  } as unknown as Response;
  return { calls, response };
}

afterEach(() => {
  process.env['APP_URL'] = ORIGINAL;
});

describe('ADR-035 · Secure según el esquema de APP_URL', () => {
  it('con https la cookie es Secure, httpOnly, Lax y Path=/', () => {
    process.env['APP_URL'] = 'https://app.ejemplo.pe';
    const { calls, response } = recorder();
    setSessionCookie(response, 'token', new Date('2026-10-15T00:00:00Z'));
    clearSessionCookie(response);
    for (const call of calls) {
      expect(call.options).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }
  });

  it('con http://localhost no es Secure: WebKit no la guardaría (bug 232088)', () => {
    process.env['APP_URL'] = 'http://localhost:3000';
    const { calls, response } = recorder();
    setSessionCookie(response, 'token', new Date('2026-10-15T00:00:00Z'));
    expect(calls[0]?.options).toMatchObject({ secure: false, httpOnly: true });
  });
});
