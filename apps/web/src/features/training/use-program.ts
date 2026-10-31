'use client';

import type { ProgramDetail } from '@nutricoach/contracts';
import { useRef, useState } from 'react';
import { apiFetch, type ApiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';

export interface ProgramEditor {
  readonly program: ProgramDetail;
  /** Una escritura con la versión leída en If-Match (02 §5). */
  readonly write: (
    path: string,
    request: Pick<ApiRequest, 'method' | 'body'>,
  ) => Promise<ProgramDetail>;
}

/**
 * Un programa en el navegador: las escrituras van de a una, y si otro guardó antes (409) se trae lo vigente; lo escrito sigue en su
 * formulario para volver a guardarlo.
 */
export function useProgram(initial: ProgramDetail): ProgramEditor {
  const [program, setProgram] = useState(initial);
  const version = useRef(initial.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const base = `/training-programs/${initial.id}`;
  const apply = (next: ProgramDetail) => {
    version.current = next.version;
    setProgram(next);
    return next;
  };
  const write: ProgramEditor['write'] = (path, request) => {
    const result = queue.current.then(async () => {
      try {
        return apply(
          await apiFetch<ProgramDetail>(`${base}${path}`, {
            ...request,
            headers: { 'If-Match': `"${String(version.current)}"` },
          }),
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          apply(await apiFetch<ProgramDetail>(base));
        }
        throw error;
      }
    });
    queue.current = result.catch(() => undefined);
    return result;
  };
  return { program, write };
}
