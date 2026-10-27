import type {
  DocumentSource,
  DocumentStatusResponse,
  GeneratedDocument,
} from '@nutricoach/contracts';

/** Cada cuánto se pregunta si la ficha ya está y cuánto se espera como máximo (RNF-04: 3 s o menos el p95). */
export const SHEET_POLL_MS = 1_000;
export const SHEET_MAX_WAIT_MS = 60_000;

/** La ficha no estuvo lista a tiempo: el worker sigue y basta con volver a pedirla. */
export class SheetTimeout extends Error {
  constructor() {
    super('La ficha tarda más de lo normal.');
    this.name = 'SheetTimeout';
  }
}

export interface SheetRequestPorts {
  /** POST /patients/:patientId/documents: 200 con la ficha o 202 (undefined) si queda en la cola del worker. */
  readonly request: () => Promise<DocumentStatusResponse | undefined>;
  /** GET /patients/:patientId/documents/status. */
  readonly status: () => Promise<DocumentStatusResponse>;
  readonly wait: (ms: number) => Promise<void>;
  readonly now: () => number;
}

/**
 * La ficha lista para descargar (RF-24): si ya existe un PDF igual, la API la devuelve al tiro (RN-H02); si no, el
 * worker la genera y se pregunta cada segundo hasta que esté, un minuto como máximo.
 */
export async function readySheet(ports: SheetRequestPorts): Promise<GeneratedDocument> {
  const requested = await ports.request();
  if (requested?.status === 'READY') return requested.document;
  const deadline = ports.now() + SHEET_MAX_WAIT_MS;
  while (ports.now() < deadline) {
    await ports.wait(SHEET_POLL_MS);
    const status = await ports.status();
    if (status.status === 'READY') return status.document;
  }
  throw new SheetTimeout();
}

/** La consulta del estado: el mismo origen que se pidió. */
export const statusQuery = (source: DocumentSource): string =>
  new URLSearchParams({ sourceType: source.sourceType, sourceId: source.sourceId }).toString();
