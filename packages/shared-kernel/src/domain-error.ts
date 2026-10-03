import { frozenCopy } from './immutable.js';

/** Código estable de error: NC, contexto y número, como `NC-ASM-004` (06 §3). */
export type ErrorCode = `NC-${string}-${string}`;

/** Regla de negocio de Notion 03, como `RN-C02`. */
export type RuleCode = `RN-${string}`;

/**
 * Error de dominio esperado. La API lo responde con RFC 9457 y 422 cuando trae `rule` (06 §5).
 * El mensaje es para personas: en español y sin datos personales.
 */
export interface DomainError {
  readonly code: ErrorCode;
  readonly rule?: RuleCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

const ERROR_CODE = /^NC-[A-Z]{2,5}-\d{3}$/;
const RULE_CODE = /^RN-[A-Z]\d{2}$/;

export function domainError(error: DomainError): DomainError {
  if (!ERROR_CODE.test(error.code)) {
    throw new TypeError(`Código de error «${error.code}» inválido: se espera NC-CONTEXTO-NNN.`);
  }
  if (error.rule !== undefined && !RULE_CODE.test(error.rule)) {
    throw new TypeError(`Regla «${error.rule}» inválida: se espera RN-X00.`);
  }
  return frozenCopy(error);
}
