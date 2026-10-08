import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

/** Valores sintéticos: no son llaves reales de ningún entorno. */
const KEY = Buffer.alloc(32, 7).toString('base64');
const VALID = {
  DATABASE_URL: 'postgresql://app_user:clave@127.0.0.1:5432/nutricoach',
  ENCRYPTION_KEYS: `v1:${KEY}`,
  BLIND_INDEX_KEY: KEY,
  APP_URL: 'http://localhost:3000',
  SMTP_URL: 'smtp://127.0.0.1:1025',
};

describe('06 §4 · las variables de entorno se validan con Zod al arrancar', () => {
  it('NODE_ENV es development si no viene', () => {
    expect(loadEnv(VALID).NODE_ENV).toBe('development');
  });

  it.each(['development', 'test', 'production'] as const)('acepta NODE_ENV=%s', (nodeEnv) => {
    const cookie =
      nodeEnv === 'production'
        ? { SESSION_COOKIE_NAME: '__Host-nc_session', APP_URL: 'https://app.ejemplo.pe' }
        : {};
    expect(loadEnv({ ...VALID, ...cookie, NODE_ENV: nodeEnv }).NODE_ENV).toBe(nodeEnv);
  });

  it('falla al arrancar con un valor desconocido', () => {
    expect(() => loadEnv({ ...VALID, NODE_ENV: 'produccion' })).toThrow();
  });

  it('01 §12 · exige la base de datos de app_user', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: undefined })).toThrow();
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'mysql://x@y/z' })).toThrow();
  });

  it('RN-B06 · acepta varias versiones de llave para rotar y rechaza llaves de otro tamaño', () => {
    expect(loadEnv({ ...VALID, ENCRYPTION_KEYS: `v1:${KEY},v2:${KEY}` }).ENCRYPTION_KEYS).toContain(
      'v2:',
    );
    expect(() => loadEnv({ ...VALID, ENCRYPTION_KEYS: KEY })).toThrow();
    expect(() => loadEnv({ ...VALID, ENCRYPTION_KEYS: 'v1:corta' })).toThrow();
    expect(() =>
      loadEnv({ ...VALID, BLIND_INDEX_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow();
  });

  it('el error no repite el valor recibido: puede ser un secreto', () => {
    const secret = 'v1:no-es-base64-pero-es-secreto';
    try {
      loadEnv({ ...VALID, ENCRYPTION_KEYS: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('secreto');
    }
  });
});

describe('P5 · acceso: origen, cookie, correo y límite de intentos', () => {
  it('APP_URL queda como origen, sin ruta ni barra final', () => {
    expect(loadEnv({ ...VALID, APP_URL: 'https://app.ejemplo.pe/panel/' }).APP_URL).toBe(
      'https://app.ejemplo.pe',
    );
    expect(() => loadEnv({ ...VALID, APP_URL: undefined })).toThrow();
  });

  it('valores por defecto: cookie nc_session, SMTP y factor 1', () => {
    expect(loadEnv(VALID)).toMatchObject({
      SESSION_COOKIE_NAME: 'nc_session',
      MAIL_DRIVER: 'smtp',
      RATE_LIMIT_FACTOR: 1,
    });
    expect(loadEnv({ ...VALID, RATE_LIMIT_FACTOR: '50' }).RATE_LIMIT_FACTOR).toBe(50);
  });

  it('smtp exige SMTP_URL; resend exige RESEND_API_KEY y MAIL_FROM', () => {
    expect(() => loadEnv({ ...VALID, SMTP_URL: undefined })).toThrow(/SMTP_URL/);
    expect(() => loadEnv({ ...VALID, MAIL_DRIVER: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(
      loadEnv({ ...VALID, MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_x', MAIL_FROM: 'A <a@b.pe>' })
        .MAIL_DRIVER,
    ).toBe('resend');
  });

  it('en producción la cookie de sesión lleva el prefijo __Host-', () => {
    expect(() => loadEnv({ ...VALID, NODE_ENV: 'production' })).toThrow(/__Host-/);
    expect(
      loadEnv({
        ...VALID,
        NODE_ENV: 'production',
        SESSION_COOKIE_NAME: '__Host-nc_session',
        APP_URL: 'https://app.ejemplo.pe',
      }).SESSION_COOKIE_NAME,
    ).toBe('__Host-nc_session');
  });

  it('ADR-035 · APP_URL con https en staging y producción, y con una cookie __Host-', () => {
    expect(loadEnv(VALID).APP_ENV).toBe('local');
    expect(() => loadEnv({ ...VALID, APP_ENV: 'staging' })).toThrow(/https/);
    expect(() => loadEnv({ ...VALID, APP_ENV: 'production' })).toThrow(/https/);
    expect(() => loadEnv({ ...VALID, SESSION_COOKIE_NAME: '__Host-nc_session' })).toThrow(/https/);
    expect(
      loadEnv({ ...VALID, APP_ENV: 'staging', APP_URL: 'https://staging.ejemplo.pe' }).APP_URL,
    ).toBe('https://staging.ejemplo.pe');
  });
});
