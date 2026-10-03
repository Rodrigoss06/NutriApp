/**
 * Identificador UUIDv7 con marca de tipo (ADR-003): un `PatientId` no se confunde con un
 * `EvaluationId`. Cada contexto define los suyos, por ejemplo `type PatientId = Id<'PatientId'>`.
 */
export type Id<TBrand extends string> = string & { readonly __brand: TBrand };

/** Organización dueña de los datos: viaja en cada evento y en la RLS (ADR-004). */
export type OrganizationId = Id<'OrganizationId'>;

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** UUIDv7 en su forma canónica: minúsculas y con guiones. */
export function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}

/**
 * Marca un UUIDv7 con su tipo. Falla con algo que no lo es: los bordes (HTTP, eventos) ya validaron,
 * así que aquí es un error de programación. El mensaje no repite el valor recibido.
 */
export function asId<TBrand extends string>(value: string): Id<TBrand> {
  if (!isUuidV7(value)) {
    throw new TypeError('Identificador inválido: se espera un UUIDv7 en minúsculas.');
  }
  return value as Id<TBrand>;
}
