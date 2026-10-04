/** Valor que se puede guardar como insumo y volver a calcular años después (RN-D01). */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

const isPlainObject = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * JSON canónico: claves ordenadas en todos los niveles y sin espacios. Rechaza lo que JSON no
 * representa con fidelidad (NaN, Infinity, undefined, fechas, funciones, instancias de clase).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Un insumo no puede ser NaN ni infinito.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    // Orden por unidades de código, sin locale; las claves de un objeto nunca se repiten.
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw new TypeError(
    `Un insumo no puede contener ${typeof value === 'object' ? 'objetos de clase' : typeof value}.`,
  );
}
