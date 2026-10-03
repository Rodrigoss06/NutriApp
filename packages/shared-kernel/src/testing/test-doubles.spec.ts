import { describe, expect, it } from 'vitest';
import { isUuidV7 } from '../id.js';
import { FixedClock, SequentialIdGenerator } from './index.js';

describe('06 §4 · dobles de Clock e IdGenerator para pruebas deterministas', () => {
  it('FixedClock devuelve la hora fijada hasta que se cambia o se adelanta', () => {
    const clock = new FixedClock('2026-10-01T12:00:00.000Z');

    expect(clock.now()).toEqual(new Date('2026-10-01T12:00:00.000Z'));
    clock.advance(90_000);
    expect(clock.now()).toEqual(new Date('2026-10-01T12:01:30.000Z'));
    clock.set('2026-12-31T23:59:59.000Z');
    expect(clock.now()).toEqual(new Date('2026-12-31T23:59:59.000Z'));
  });

  it('FixedClock entrega copias: modificar la fecha recibida no cambia el reloj', () => {
    const clock = new FixedClock('2026-10-01T12:00:00.000Z');
    clock.now().setUTCFullYear(1999);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it('SequentialIdGenerator genera UUIDv7 válidos, crecientes y repetibles', () => {
    const first = new SequentialIdGenerator();
    const ids = [first.newId(), first.newId(), first.newId()];

    expect(ids.every(isUuidV7)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(3);
    expect(new SequentialIdGenerator().newId()).toBe(ids[0]);
  });
});
