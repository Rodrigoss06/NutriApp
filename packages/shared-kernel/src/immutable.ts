interface Equatable {
  equals(other: unknown): boolean;
}

const isEquatable = (value: unknown): value is Equatable =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Partial<Equatable>).equals === 'function';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Copia profunda y congelada de objetos planos y arreglos. Las fechas se copian (un `Date` no se
 * puede congelar de verdad) y las instancias de clase, como otros value objects, se conservan.
 */
export function frozenCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze((value as unknown[]).map((item) => frozenCopy(item))) as T;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(([key, item]) => [key, frozenCopy(item)] as const);
    return Object.freeze(Object.fromEntries(entries)) as T;
  }
  return value;
}

/** Igualdad estructural: por valor en objetos planos, arreglos y fechas; `equals` en el resto. */
export function structurallyEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (isEquatable(a) && isEquatable(b)) return a.equals(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => structurallyEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && structurallyEqual(a[key], b[key]))
    );
  }
  return false;
}
