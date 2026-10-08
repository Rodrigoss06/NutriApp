import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProblemException, type ProblemBody } from './problem.js';

/** Títulos de los errores que no traen el suyo (rutas inexistentes, cuerpos mal formados…). */
const GENERIC_TITLES: Readonly<Record<number, string>> = {
  400: 'La petición no es válida.',
  401: 'Tu sesión no es válida. Vuelve a entrar.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No encontrado.',
  405: 'Método no permitido.',
  409: 'Conflicto con el estado actual.',
  413: 'La petición es demasiado grande.',
  415: 'Tipo de contenido no admitido.',
  422: 'La petición no cumple una regla de negocio.',
  429: 'Demasiados intentos. Espera un momento.',
};

const genericCode = (status: number): string => `NC-PLT-${String(status)}`;

export interface ProblemResponse {
  readonly status: number;
  readonly body: ProblemBody;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Respuesta RFC 9457 de una excepción (06 §5). La usan el filtro global y la idempotencia, que guarda y repite los
 * 4xx tal como salieron. Una falla inesperada es 500 sin detalles.
 */
export function toProblem(exception: unknown): ProblemResponse {
  if (exception instanceof ProblemException) {
    return {
      status: exception.getStatus(),
      body: exception.getResponse() as ProblemBody,
      headers: { ...exception.headers },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const raw: unknown = exception.getResponse();
    const given: Partial<ProblemBody> = typeof raw === 'object' && raw !== null ? raw : {};
    return {
      status,
      body: {
        type: 'about:blank',
        status,
        title: typeof given.title === 'string' ? given.title : (GENERIC_TITLES[status] ?? 'Error.'),
        code: typeof given.code === 'string' ? given.code : genericCode(status),
        ...(typeof given.rule === 'string' ? { rule: given.rule } : {}),
        ...(typeof given.detail === 'string' ? { detail: given.detail } : {}),
      },
      headers: {},
    };
  }
  const status = HttpStatus.INTERNAL_SERVER_ERROR;
  return {
    status,
    body: {
      type: 'about:blank',
      status,
      title: 'Ocurrió un error inesperado.',
      code: genericCode(status),
    },
    headers: {},
  };
}

/**
 * Toda respuesta de error en RFC 9457 con code, rule y requestId (06 §5), como application/problem+json. Una
 * falla inesperada se registra solo con su tipo: nunca datos de la petición.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  readonly #logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    if (!(exception instanceof HttpException)) {
      this.#logger.error(
        `Falla inesperada: ${exception instanceof Error ? exception.name : typeof exception}`,
      );
    }
    const { status, body, headers } = toProblem(exception);
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response
      .status(status)
      .type('application/problem+json')
      .json({ ...body, ...(requestId ? { requestId } : {}) });
  }
}
