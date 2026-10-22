'use client';

import { Notice } from '@nutricoach/ui';
import { errorMessage, problemList } from '@/lib/api/problem';

/** Error de una mutación, en español y anunciado (role=alert), con los problemas que detalle la API. */
export function FormError({
  error,
  title = 'No se pudo completar',
}: {
  error: unknown;
  title?: string;
}) {
  if (!error) return null;
  const problems = problemList(error);
  return (
    <Notice tone="danger" title={title}>
      {errorMessage(error)}
      {problems.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
}
