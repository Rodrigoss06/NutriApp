'use client';

import type {
  FunctionalEvaluation,
  SaveMovementTest,
  SavePhysicalResult,
} from '@nutricoach/contracts';
import { useRef, useState } from 'react';
import { apiFetch, apiUpload } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';

export interface FunctionalEvaluationDraft {
  readonly evaluation: FunctionalEvaluation;
  readonly saveMovementTest: (
    testCode: string,
    body: SaveMovementTest,
  ) => Promise<FunctionalEvaluation>;
  readonly savePhysicalResult: (
    testCode: string,
    body: SavePhysicalResult,
  ) => Promise<FunctionalEvaluation>;
  readonly removeTest: (testCode: string) => Promise<FunctionalEvaluation>;
  readonly attachEvidence: (testCode: string, file: File) => Promise<FunctionalEvaluation>;
  readonly removeEvidence: (testCode: string) => Promise<FunctionalEvaluation>;
  readonly close: () => Promise<FunctionalEvaluation>;
}

/**
 * Una evaluación funcional en el navegador: cada escritura lleva la versión anterior en If-Match (02 §5) y van de a una, para
 * que guardar dos pruebas seguidas no choque consigo mismo. Si otro guardó antes (409), se trae lo vigente; lo escrito sigue
 * en su formulario.
 */
export function useFunctionalEvaluation(initial: FunctionalEvaluation): FunctionalEvaluationDraft {
  const [evaluation, setEvaluation] = useState(initial);
  const version = useRef(initial.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const path = `/functional-evaluations/${initial.id}`;

  const apply = (next: FunctionalEvaluation) => {
    version.current = next.version;
    setEvaluation(next);
    return next;
  };
  const write = (
    send: (headers: Readonly<Record<string, string>>) => Promise<FunctionalEvaluation>,
  ): Promise<FunctionalEvaluation> => {
    const result = queue.current.then(async () => {
      try {
        return apply(await send({ 'If-Match': `"${String(version.current)}"` }));
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          apply(await apiFetch<FunctionalEvaluation>(path));
        }
        throw error;
      }
    });
    queue.current = result.catch(() => undefined);
    return result;
  };

  return {
    evaluation,
    saveMovementTest: (testCode, body) =>
      write((headers) =>
        apiFetch(`${path}/movement/${testCode}`, { method: 'PUT', body, headers }),
      ),
    savePhysicalResult: (testCode, body) =>
      write((headers) =>
        apiFetch(`${path}/physical/${testCode}`, { method: 'PUT', body, headers }),
      ),
    removeTest: (testCode) =>
      write((headers) => apiFetch(`${path}/tests/${testCode}`, { method: 'DELETE', headers })),
    attachEvidence: (testCode, file) =>
      write((headers) => {
        const form = new FormData();
        form.set('evidence', file);
        return apiUpload(`${path}/tests/${testCode}/evidence`, form, 'POST', headers);
      }),
    removeEvidence: (testCode) =>
      write((headers) =>
        apiFetch(`${path}/tests/${testCode}/evidence`, { method: 'DELETE', headers }),
      ),
    close: () => write((headers) => apiFetch(`${path}/close`, { method: 'POST', headers })),
  };
}
