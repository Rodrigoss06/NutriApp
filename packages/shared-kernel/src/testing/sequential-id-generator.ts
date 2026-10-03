import { asId, type Id } from '../id.js';
import type { IdGenerator } from '../ports/id-generator.port.js';

/** Generador de pruebas: UUIDv7 válidos, crecientes y repetibles en cada instancia. */
export class SequentialIdGenerator implements IdGenerator {
  #next = 1;

  newId<TBrand extends string>(): Id<TBrand> {
    const counter = (this.#next++).toString(16).padStart(12, '0');
    return asId<TBrand>(`01920000-0000-7000-8000-${counter}`);
  }
}
