/** Puerto de tiempo (06 §4): el dominio no llama a `new Date()`; pide la hora a un Clock. */
export interface Clock {
  now(): Date;
}

/** Token de inyección del Clock. */
export const CLOCK = Symbol.for('nutricoach.Clock');
