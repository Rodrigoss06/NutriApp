import { describe, expect, it } from 'vitest';
import { SystemClock } from './system.clock.js';

describe('06 §4 · el Clock de la aplicación da la hora del sistema', () => {
  it('devuelve el instante actual', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
