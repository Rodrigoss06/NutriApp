import { createHash } from 'node:crypto';

/** JSON con las claves ordenadas: el mismo cuerpo con otro orden de claves es la misma petición. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  // JSON.stringify devuelve undefined con undefined o funciones, aunque su tipo diga string.
  const json = JSON.stringify(value) as string | undefined;
  return json ?? 'null';
}

/** SHA-256 de método, ruta y cuerpo canónico. Solo el hash se guarda: el cuerpo puede traer datos de salud. */
export function requestHash(method: string, path: string, body: unknown): Buffer {
  return createHash('sha256')
    .update(`${method.toUpperCase()} ${path}\n${stableStringify(body ?? null)}`)
    .digest();
}
