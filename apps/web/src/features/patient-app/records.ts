'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

/** RN-G08: el clientId que genera el celular para cada registro; un reintento lo repite y la API no lo duplica. */
export const newClientId = (): string => crypto.randomUUID();

/** La clave de una acción: una por cada vez que el paciente toca el botón (06 §5). */
export const newActionKey = (): string => crypto.randomUUID();

/**
 * Un registro desde la app: POST con su clientId y la misma Idempotency-Key en cada reintento (02 §6). Al terminar, Hoy y el plan
 * se vuelven a leer del servidor.
 */
export function useRecord<TBody extends { readonly clientId: string }, TResponse>(path: string) {
  const router = useRouter();
  return useMutation({
    mutationFn: (body: TBody) =>
      apiFetch<TResponse>(path, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': `rec:${body.clientId}` },
      }),
    retry: 2,
    onSuccess: () => {
      router.refresh();
    },
  });
}

/**
 * Una acción del paciente que no es un registro del día (autorizar, retirar o responder el cribado): POST con una
 * Idempotency-Key nueva por cada acción (06 §5). Un reintento automático de la misma acción repite su clave; retirar y volver
 * a autorizar son dos acciones.
 */
export function useMeAction<TResponse>(path: string) {
  const router = useRouter();
  return useMutation({
    mutationFn: ({ body, key }: { body?: unknown; key: string }) =>
      apiFetch<TResponse>(path, {
        method: 'POST',
        ...(body === undefined ? {} : { body }),
        headers: { 'Idempotency-Key': `act:${key}` },
      }),
    retry: 2,
    onSuccess: () => {
      router.refresh();
    },
  });
}

/** Anular un registro (RN-G12): no lo borra, queda anulado y fuera del día. */
export function useVoid(path: string) {
  const router = useRouter();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<unknown>(`${path}/${id}/void`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `void:${id}` },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
}

const portions = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** «1 porción», «1.5 porciones». */
export const servingsText = (servings: number): string =>
  `${portions.format(servings)} ${servings === 1 ? 'porción' : 'porciones'}`;
