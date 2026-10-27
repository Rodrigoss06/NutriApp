import { ApiError, type ProblemBody } from './problem';

export interface ApiRequest {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * La API desde el navegador: misma origen (/api, ADR-031), la cookie viaja sola y el navegador pone Origin. Toda
 * mutación pasa por aquí con TanStack Query; ninguna Server Action llama a la API.
 */
export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: request.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...request.headers,
    },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });
  return parseResponse<T>(response);
}

/**
 * Un multipart desde el navegador (la evidencia del consentimiento va en el mismo pedido, ADR-038; el logo de la marca
 * reemplaza al anterior con PUT). El navegador pone el Content-Type con su boundary.
 */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  method: 'POST' | 'PUT' = 'POST',
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    body: form,
  });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 202) return undefined as T;
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new ApiError(
      response.status,
      payload as ProblemBody,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }
  return payload as T;
}
