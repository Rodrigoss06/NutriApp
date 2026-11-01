import { describe, expect, it } from 'vitest';
import { documentSourceSchema, documentStatusSchema } from './document.js';

describe('RN-H02 · fichas desde un origen publicado', () => {
  it('pide la ficha de un plan, de una evaluación o de un programa por su id', () => {
    const source = {
      sourceType: 'NUTRITION_PLAN',
      sourceId: '019a1c00-0000-7000-8000-000000000001',
    };
    expect(documentSourceSchema.parse(source)).toEqual(source);
    const program = { ...source, sourceType: 'TRAINING_PROGRAM' };
    expect(documentSourceSchema.parse(program)).toEqual(program);
    expect(documentSourceSchema.safeParse({ ...source, sourceType: 'DRAFT' }).success).toBe(false);
    expect(documentSourceSchema.safeParse({ ...source, sourceId: 'plan-1' }).success).toBe(false);
  });

  it('responde la ficha lista o en la cola', () => {
    expect(documentStatusSchema.parse({ status: 'PENDING' })).toEqual({ status: 'PENDING' });
    const ready = {
      status: 'READY',
      document: {
        id: '019a1c00-0000-7000-8000-000000000002',
        kind: 'EXCHANGE_DIET',
        sourceType: 'NUTRITION_PLAN',
        sourceId: '019a1c00-0000-7000-8000-000000000001',
        templateVersion: '1.0.0',
        sha256: 'a'.repeat(64),
        generatedAt: '2026-10-25T15:00:00.000Z',
        fileName: 'ficha-dieta-por-intercambios.pdf',
      },
    };
    expect(documentStatusSchema.parse(ready)).toEqual(ready);
  });
});
