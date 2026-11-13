import { describe, expect, it } from 'vitest';
import { fromCents, toCents } from './platform-api';

describe('RF-39 · el precio de un plan en céntimos (05 §2)', () => {
  it('convierte soles a céntimos sin coma flotante y de vuelta', () => {
    expect(toCents('150')).toBe(15_000);
    expect(toCents('150.5')).toBe(15_050);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('19,99')).toBe(1_999);
    expect(fromCents(15_050)).toBe('150.50');
    expect(fromCents(5)).toBe('0.05');
  });
});
