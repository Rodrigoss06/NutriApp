import type { Id } from '../id.js';

/**
 * Puerto de identidad (ADR-003): el dominio genera UUIDv7 antes de guardar, con orden temporal.
 * Uso: `ids.newId<'PatientId'>()`.
 */
export interface IdGenerator {
  newId<TBrand extends string>(): Id<TBrand>;
}

/** Token de inyección del IdGenerator. */
export const ID_GENERATOR = Symbol.for('nutricoach.IdGenerator');
