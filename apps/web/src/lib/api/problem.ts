/**
 * Errores de la API (RFC 9457, 06 §5) para la interfaz: mensaje en español según el code; en un 5xx, el requestId
 * como código de referencia para soporte. Sin datos de la persona.
 */
export interface ProblemBody {
  readonly status?: number;
  readonly title?: string;
  readonly code?: string;
  readonly rule?: string;
  readonly requestId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemBody,
    /** Segundos de Retry-After en un 429. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(problem.code ?? `HTTP ${String(status)}`);
    this.name = 'ApiError';
  }

  get code(): string | undefined {
    return this.problem.code;
  }
}

/** Mensajes propios de la web cuando el título de la API no basta o no conviene mostrarlo tal cual. */
const MESSAGES: Readonly<Record<string, string>> = {
  'NC-IAM-010':
    'Correo o contraseña incorrectos. Tras 5 intentos fallidos, el acceso se pausa 15 minutos.',
  'NC-IAM-011': 'La contraseña actual no es correcta.',
  'NC-IAM-020': 'Tu sesión venció. Vuelve a entrar.',
  'NC-IAM-030': 'El enlace venció o ya se usó. Pide otro desde «Olvidé mi contraseña».',
  'NC-IAM-040': 'La invitación venció, ya se usó o fue anulada. Pide una nueva a quien te invitó.',
  'NC-PLT-010': 'No pudimos verificar el origen de la petición. Recarga la página.',
  'NC-TEN-022':
    'Alguien cambió estos datos mientras los editabas. Recarga para ver la versión actual.',
};

export function minutesUntil(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}

/** El texto que ve la persona para un error de la API. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentar.';
  }
  if (error.status === 429) {
    const minutes = minutesUntil(error.retryAfterSeconds ?? 60);
    return `Demasiados intentos. Vuelve a intentar en ${String(minutes)} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
  }
  if (error.status >= 500) {
    const reference = error.problem.requestId
      ? ` Código de referencia: ${error.problem.requestId}.`
      : '';
    return `Ocurrió un error inesperado. Vuelve a intentar en unos minutos.${reference}`;
  }
  const known = error.code ? MESSAGES[error.code] : undefined;
  return known ?? error.problem.title ?? 'No pudimos completar la acción.';
}
