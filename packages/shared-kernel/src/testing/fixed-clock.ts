import type { Clock } from '../ports/clock.port.js';

/** Reloj de pruebas: siempre la misma hora hasta que la prueba la cambia. */
export class FixedClock implements Clock {
  #epochMs: number;

  constructor(instant: Date | string = '2026-10-01T12:00:00.000Z') {
    this.#epochMs = new Date(instant).getTime();
  }

  now(): Date {
    return new Date(this.#epochMs);
  }

  set(instant: Date | string): void {
    this.#epochMs = new Date(instant).getTime();
  }

  advance(milliseconds: number): void {
    this.#epochMs += milliseconds;
  }
}
