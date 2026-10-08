import { HttpException } from '@nestjs/common';
import type { DomainError } from '@nutricoach/shared-kernel';

/** Error de la API en RFC 9457 más code, rule y requestId (06 §5). */
export interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly rule?: string;
  readonly detail?: string;
  readonly requestId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ProblemInit = Omit<ProblemBody, 'type' | 'status' | 'requestId'>;

/** Excepción con cuerpo RFC 9457. Los adaptadores la lanzan; el filtro global agrega el requestId. */
export class ProblemException extends HttpException {
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    status: number,
    problem: ProblemInit,
    headers: Readonly<Record<string, string>> = {},
  ) {
    super({ type: 'about:blank', status, ...problem } satisfies ProblemBody, status);
    this.headers = headers;
  }
}

/**
 * Un error de dominio esperado como respuesta HTTP: 422 cuando cita una regla de negocio (06 §5), o el estado
 * que indique el caso de uso (409 de versión, 404 de otra organización…).
 */
export function problemFromDomainError(
  error: DomainError,
  status = error.rule ? 422 : 400,
): ProblemException {
  return new ProblemException(status, {
    title: error.message,
    code: error.code,
    ...(error.rule ? { rule: error.rule } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
}
