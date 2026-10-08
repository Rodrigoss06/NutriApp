'use client';

import { Notice } from '@nutricoach/ui';
import { errorMessage } from '@/lib/api/problem';

/** Error de una mutación, en español y anunciado (role=alert). */
export function FormError({
  error,
  title = 'No se pudo completar',
}: {
  error: unknown;
  title?: string;
}) {
  if (!error) return null;
  return (
    <Notice tone="danger" title={title}>
      {errorMessage(error)}
    </Notice>
  );
}
