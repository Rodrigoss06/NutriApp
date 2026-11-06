import { describe, expect, it } from 'vitest';
import {
  decideWeeklyReviewSchema,
  WEEKLY_ACTION_TEXTS,
  WEEKLY_REASON_TEXTS,
} from './weekly-review.js';

describe('RN-F17 · la decisión del coach', () => {
  it('mantener no lleva factor; ajustar y descargar sí, con hasta 2 decimales y de 0 a 2', () => {
    expect(decideWeeklyReviewSchema.parse({ decision: 'KEEP', note: 'Sigue igual.' })).toEqual({
      decision: 'KEEP',
      volumeFactor: null,
      note: 'Sigue igual.',
    });
    expect(decideWeeklyReviewSchema.safeParse({ decision: 'ADJUST', note: 'Baja.' }).success).toBe(
      false,
    );
    expect(
      decideWeeklyReviewSchema.safeParse({ decision: 'DELOAD', volumeFactor: 0.825, note: 'Baja.' })
        .success,
    ).toBe(false);
    expect(
      decideWeeklyReviewSchema.safeParse({ decision: 'DELOAD', volumeFactor: 2.5, note: 'Baja.' })
        .success,
    ).toBe(false);
    expect(
      decideWeeklyReviewSchema.parse({ decision: 'DELOAD', volumeFactor: 0.83, note: 'Baja.' })
        .volumeFactor,
    ).toBe(0.83);
  });

  it('siempre con nota', () => {
    expect(decideWeeklyReviewSchema.safeParse({ decision: 'KEEP', note: '   ' }).success).toBe(
      false,
    );
  });

  it('cada decisión sugerida y cada razón tiene su texto (07 §10)', () => {
    expect(WEEKLY_ACTION_TEXTS.DELOAD).toBe('Descarga 20–30 % y revisar');
    expect(Object.keys(WEEKLY_REASON_TEXTS)).toHaveLength(6);
  });
});
