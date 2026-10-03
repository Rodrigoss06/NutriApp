import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { isUuidV7 } from '@nutricoach/shared-kernel';
import {
  REDACTED,
  loggerLevel,
  pathOnly,
  redactOptions,
  resolveRequestId,
  serializeRequest,
} from './logger.options.js';

/** Logger con la misma redacción que la API, que escribe en memoria. */
function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { redact: redactOptions },
    {
      write: (line: string) => {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  return { lines, logger };
}

describe('06 §4 y 01 §8 · los logs nunca llevan datos personales ni secretos (regla dura 7)', () => {
  it('redacta contraseñas, tokens, nombres, documentos, correos y teléfonos', () => {
    const { lines, logger } = captureLogs();

    logger.info({
      password: 'clave-sintetica',
      token: 'token-sintetico',
      firstName: 'Nombre',
      lastName: 'Apellido',
      documentNumber: '00000000',
      email: 'persona@ejemplo.test',
      phone: '+51 000 000 000',
    });

    expect(lines[0]).toMatchObject({
      password: REDACTED,
      token: REDACTED,
      firstName: REDACTED,
      lastName: REDACTED,
      documentNumber: REDACTED,
      email: REDACTED,
      phone: REDACTED,
    });
  });

  it('redacta también dentro de objetos anidados', () => {
    const { lines, logger } = captureLogs();

    logger.info({ patient: { name: 'Nombre', contact: { email: 'persona@ejemplo.test' } } });

    expect(lines[0]).toMatchObject({ patient: { name: REDACTED, contact: { email: REDACTED } } });
  });

  it('nunca escribe la cookie de sesión ni la cabecera Authorization', () => {
    const { lines, logger } = captureLogs();

    logger.info({ req: { headers: { cookie: 'nc_session=abc', authorization: 'Bearer abc' } } });

    expect(lines[0]).toMatchObject({
      req: { headers: { cookie: REDACTED, authorization: REDACTED } },
    });
  });

  it('conserva lo que no es personal: identificadores y estados', () => {
    const { lines, logger } = captureLogs();

    logger.info({ patientId: '01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e', status: 'ACTIVE' });

    expect(lines[0]).toMatchObject({
      patientId: '01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e',
      status: 'ACTIVE',
    });
  });

  it('una petición se registra con id, método y ruta, sin query string ni cabeceras', () => {
    const request = {
      id: 'req-1',
      method: 'GET',
      url: '/api/v1/patients?search=nombre&document=00000000',
      headers: { cookie: 'nc_session=abc' },
      remoteAddress: '203.0.113.7',
    };

    expect(serializeRequest(request)).toEqual({
      id: 'req-1',
      method: 'GET',
      url: '/api/v1/patients',
    });
    expect(pathOnly(undefined)).toBe('');
  });
});

describe('RNF-24 · cada línea de log lleva requestId', () => {
  it('conserva un x-request-id entrante que sea un UUID', () => {
    expect(resolveRequestId('01928C4E-3F5A-7B2C-9D1E-0F2A3B4C5D6E')).toBe(
      '01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e',
    );
  });

  it.each([undefined, '', 'no-es-un-uuid', ['a', 'b']])(
    'genera un UUIDv7 nuevo si el entrante es %j',
    (incoming) => {
      expect(isUuidV7(resolveRequestId(incoming))).toBe(true);
    },
  );
});

describe('nivel de log por entorno', () => {
  it('info en producción, silencio en pruebas y debug en desarrollo', () => {
    expect(loggerLevel('production')).toBe('info');
    expect(loggerLevel('test')).toBe('silent');
    expect(loggerLevel('development')).toBe('debug');
  });
});
