import type { RecordAdjustment } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  adjustmentBody,
  foodFields,
  hydrationFields,
  latestByTarget,
  shiftDate,
} from './adjustments';

const TARGET = '0193a000-0000-7000-8000-000000000001';
const adjustment = (id: string, createdAt: string): RecordAdjustment => ({
  id,
  targetType: 'HYDRATION',
  targetId: TARGET,
  targetLocalDate: '2026-11-04',
  action: 'EXCLUDE',
  correctedValues: null,
  reason: 'Lo registró dos veces por error.',
  authorMemberId: '0193a000-0000-7000-8000-000000000002',
  createdAt,
});
const base = {
  targetType: 'HYDRATION' as const,
  targetId: TARGET,
  targetLocalDate: '2026-11-04',
  fields: hydrationFields(250),
  reason: 'Lo registró dos veces por error.',
};

describe('RN-G02 · el ajuste que vale y el cuerpo del ajuste', () => {
  it('vale el más reciente de cada registro', () => {
    const latest = latestByTarget([
      adjustment('a-2', '2026-11-04T16:05:00.000Z'),
      adjustment('a-1', '2026-11-04T16:00:00.000Z'),
    ]);
    expect(latest.get(TARGET)?.id).toBe('a-2');
  });

  it('excluir va sin valores; corregir lleva solo lo que cambió', () => {
    expect(adjustmentBody({ ...base, action: 'EXCLUDE', values: { volumeMl: 500 } })).toMatchObject(
      {
        ok: true,
        body: { action: 'EXCLUDE', correctedValues: null },
      },
    );
    expect(adjustmentBody({ ...base, action: 'CORRECT', values: { volumeMl: 500 } })).toMatchObject(
      {
        ok: true,
        body: { action: 'CORRECT', correctedValues: { volumeMl: 500 } },
      },
    );
  });

  it('sin cambios o sin motivo suficiente, dice qué falta', () => {
    expect(adjustmentBody({ ...base, action: 'CORRECT', values: { volumeMl: 250 } })).toEqual({
      ok: false,
      problem: 'Cambia al menos un valor, o elige excluir el registro.',
    });
    expect(adjustmentBody({ ...base, action: 'EXCLUDE', values: {}, reason: 'Error' })).toEqual({
      ok: false,
      problem: 'Escribe el motivo, de 10 caracteres o más.',
    });
  });

  it('ADR-085: una comida se corrige en la unidad en que se registró', () => {
    const food = { servings: 2, grams: 100 } as Parameters<typeof foodFields>[0];
    expect(foodFields(food).map((field) => field.key)).toEqual(['servings']);
    expect(foodFields({ ...food, servings: null }).map((field) => field.key)).toEqual(['grams']);
  });

  it('RN-G04: el día anterior y el siguiente, como fechas locales', () => {
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
