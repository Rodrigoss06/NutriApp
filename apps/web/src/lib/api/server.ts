import 'server-only';
import { cookies, headers } from 'next/headers';
import { apiInternalUrl } from '@/config/env';

export type ServerResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly status: number };

/**
 * La API desde un componente de servidor: sin caché, con la cookie de la petición y X-Forwarded-For, para que la
 * API vea a la persona y no al servidor de Next. Solo lecturas: las mutaciones van desde el navegador.
 */
export async function serverApi<T>(path: string): Promise<ServerResult<T>> {
  const [cookieStore, incoming] = await Promise.all([cookies(), headers()]);
  const forwardedFor = incoming.get('x-forwarded-for');
  const response = await fetch(`${apiInternalUrl()}/api/v1${path}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      cookie: cookieStore.toString(),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
    },
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, data: (await response.json()) as T };
}
