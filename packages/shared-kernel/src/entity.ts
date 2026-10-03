/** Entidad (02 §5): la identifica su id, no sus datos. */
export abstract class Entity<TId extends string> {
  readonly #id: TId;

  protected constructor(id: TId) {
    this.#id = id;
  }

  get id(): TId {
    return this.#id;
  }

  equals(other: Entity<TId> | null | undefined): boolean {
    if (other === null || other === undefined) return false;
    if (other === this) return true;
    return other.constructor === this.constructor && other.id === this.#id;
  }
}
