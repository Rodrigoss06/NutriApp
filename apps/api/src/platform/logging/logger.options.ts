import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import type { NodeEnv } from '../config/env.js';

export const REDACTED = '[REDACTADO]';
export const REQUEST_ID_HEADER = 'x-request-id';

/** Datos personales y secretos que pino nunca escribe (06 §4, 01 §8 y regla dura 7). */
const SENSITIVE_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'secret',
  'apiKey',
  'name',
  'firstName',
  'lastName',
  'fullName',
  'displayName',
  'document',
  'documentNumber',
  'email',
  'phone',
  'phoneNumber',
];

export const redactOptions = {
  paths: [
    ...SENSITIVE_KEYS,
    ...SENSITIVE_KEYS.map((key) => `*.${key}`),
    ...SENSITIVE_KEYS.map((key) => `*.*.${key}`),
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
  ],
  censor: REDACTED,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Conserva el x-request-id entrante si es un UUID; si no, genera un UUIDv7 (RNF-24). */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  return typeof incoming === 'string' && UUID.test(incoming) ? incoming.toLowerCase() : uuidv7();
}

/** La ruta sin query string: los parámetros de una búsqueda pueden traer nombres o documentos. */
export function pathOnly(url: string | undefined): string {
  const [path = ''] = (url ?? '').split('?', 1);
  return path;
}

export function loggerLevel(nodeEnv: NodeEnv): 'info' | 'debug' | 'silent' {
  if (nodeEnv === 'production') return 'info';
  if (nodeEnv === 'test') return 'silent';
  return 'debug';
}

/** Una petición se registra solo con su id, método y ruta: sin cabeceras, IP ni cuerpo. */
export function serializeRequest(req: { id: unknown; method: string; url: string }) {
  return { id: req.id, method: req.method, url: pathOnly(req.url) };
}

export function serializeResponse(res: { statusCode: number }) {
  return { statusCode: res.statusCode };
}

/** Logs JSON por la salida estándar (01 §8); en desarrollo `pnpm dev` los pasa por pino-pretty. */
export function buildLoggerParams(nodeEnv: NodeEnv): Params {
  return {
    pinoHttp: {
      level: loggerLevel(nodeEnv),
      redact: redactOptions,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
        res.setHeader(REQUEST_ID_HEADER, requestId);
        return requestId;
      },
      customProps: (req: IncomingMessage & { id?: unknown }) => ({ requestId: req.id }),
      serializers: { req: serializeRequest, res: serializeResponse },
      // Los monitores consultan la salud a cada rato: no llenan los logs.
      autoLogging: {
        ignore: (req: IncomingMessage) => pathOnly(req.url).startsWith('/api/health/'),
      },
    },
  };
}
