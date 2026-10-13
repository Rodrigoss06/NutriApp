import { describe, expect, it } from 'vitest';
import {
  anonymousContext,
  domainError,
  err,
  isErr,
  isOk,
  ok,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from './atomically.js';

/** Una unidad de trabajo que anota si la transacción terminó confirmada o revertida. */
function recordingUow() {
  const outcomes: string[] = [];
  const uow: UnitOfWork = {
    run: async (_context, work) => {
      try {
        const result = await work();
        outcomes.push('commit');
        return result;
      } catch (error) {
        outcomes.push('rollback');
        throw error;
      }
    },
    query: (_context, work) => work(),
  };
  return { uow, outcomes };
}

const FAILED = domainError({ code: 'NC-PLT-999', message: 'falló' });

describe('atomically · un error de dominio revierte toda la transacción', () => {
  it('confirma lo que termina bien', async () => {
    const { uow, outcomes } = recordingUow();
    const result = await atomically(uow, anonymousContext(), () => Promise.resolve(ok(7)));
    expect(isOk(result) && result.value).toBe(7);
    expect(outcomes).toEqual(['commit']);
  });

  it('revierte y devuelve el error como Result', async () => {
    const { uow, outcomes } = recordingUow();
    const result = await atomically(uow, anonymousContext(), () => Promise.resolve(err(FAILED)));
    expect(isErr(result) && result.error.code).toBe('NC-PLT-999');
    expect(outcomes).toEqual(['rollback']);
  });

  it('una falla técnica sigue siendo una excepción', async () => {
    const { uow } = recordingUow();
    await expect(
      atomically(uow, anonymousContext(), () => Promise.reject(new Error('caída'))),
    ).rejects.toThrow('caída');
  });
});
