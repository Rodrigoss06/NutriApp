import { frozenCopy, structurallyEqual } from './immutable.js';

/** Value object (02 §5): sin identidad, inmutable e igual a otro si sus valores son iguales. */
export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = frozenCopy(props);
  }

  equals(other: ValueObject<TProps> | null | undefined): boolean {
    if (other === null || other === undefined) return false;
    if (other === this) return true;
    return other.constructor === this.constructor && structurallyEqual(this.props, other.props);
  }
}
