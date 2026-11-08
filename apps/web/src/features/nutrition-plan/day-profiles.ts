import { parseDecimal, type DayProfile, type DayProfileInput } from '@nutricoach/contracts';

/**
 * Un perfil de día mientras se escribe (07 §2; P-20, respuestas de Jeremy): textos, para que la persona pueda dejar un campo a
 * medias. code es null en un perfil nuevo: sale del nombre al guardar. Descanso es REST; Entrenamiento es la prescripción y no
 * va aquí.
 */
export interface DayProfileRow {
  readonly key: string;
  readonly code: string | null;
  readonly name: string;
  readonly choG: string;
  readonly proteinG: string;
  readonly fatG: string;
}

interface Targets {
  readonly proteinG: number;
  readonly fatG: number;
}

export const REST_CODE = 'REST';
/** Los códigos que un perfil propio no puede tomar: Descanso y Entrenamiento tienen el suyo. */
const RESERVED = new Set([REST_CODE, 'TRAINING']);
const MAX_GRAMS = 1_000;

/** Con un decimal, como los guarda la base. */
const gramsText = (value: number): string => String(Math.round(value * 10) / 10);

/** Los perfiles guardados, listos para editarse. */
export const dayProfileRowsOf = (profiles: readonly DayProfile[]): DayProfileRow[] =>
  profiles.map((profile) => ({
    key: `perfil-${profile.code}`,
    code: profile.code,
    name: profile.name,
    choG: gramsText(profile.choG),
    proteinG: gramsText(profile.proteinG),
    fatG: gramsText(profile.fatG),
  }));

/** Descanso con la proteína y la grasa de Entrenamiento ya puestas; los carbohidratos los escribe el coach (P-20.1). */
export const restProfileRow = (training: Targets, key: string): DayProfileRow => ({
  key,
  code: REST_CODE,
  name: 'Descanso',
  choG: '',
  proteinG: gramsText(training.proteinG),
  fatG: gramsText(training.fatG),
});

/** Un perfil propio (alto, bajo, refeed, competencia...), también con la proteína y la grasa de Entrenamiento (P-20.1, P-20.4). */
export const customProfileRow = (training: Targets, key: string): DayProfileRow => ({
  ...restProfileRow(training, key),
  code: null,
  name: '',
});

export const withoutProfile = (rows: readonly DayProfileRow[], key: string): DayProfileRow[] =>
  rows.filter((row) => row.key !== key);

/**
 * El código de un perfil nuevo, desde su nombre: mayúsculas sin tildes, guion bajo en vez de espacios, hasta 20 caracteres y
 * empezando con una letra. Si choca con otro, con Descanso o con Entrenamiento, lleva _2, _3...
 */
export function profileCodeOf(name: string, taken: ReadonlySet<string>): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base =
    (/^[A-Z]/.test(slug) ? slug : `P_${slug}`).slice(0, 20).replace(/_+$/, '') || 'PERFIL';
  let code = base;
  for (let n = 2; taken.has(code) || RESERVED.has(code); n += 1) {
    const suffix = `_${String(n)}`;
    code = `${base.slice(0, 20 - suffix.length)}${suffix}`;
  }
  return code;
}

const gramsOf = (text: string): number | null => {
  const value = parseDecimal(text);
  return value !== null && value >= 0 && value <= MAX_GRAMS ? value : null;
};

/** Lo que no sirve de un perfil, campo por campo, para decirlo junto al campo. */
export function dayProfileErrors(
  row: DayProfileRow,
): Partial<Record<'name' | 'choG' | 'proteinG' | 'fatG', string>> {
  const errors: Partial<Record<'name' | 'choG' | 'proteinG' | 'fatG', string>> = {};
  const name = row.name.trim();
  if (name === '' || name.length > 40) errors.name = 'Un nombre de hasta 40 caracteres.';
  for (const field of ['choG', 'proteinG', 'fatG'] as const) {
    if (gramsOf(row[field]) === null) errors[field] = 'De 0 a 1000 g.';
  }
  return errors;
}

/**
 * Los perfiles para el cuerpo de PUT y de la vista previa, o null mientras alguno no sirva. Las reglas que cruzan perfiles
 * (nombres repetidos, hasta 6) las decide la API y las explica en su 422.
 */
export function dayProfilesBody(rows: readonly DayProfileRow[]): DayProfileInput[] | null {
  const taken = new Set(rows.flatMap((row) => (row.code ? [row.code] : [])));
  const profiles: DayProfileInput[] = [];
  for (const row of rows) {
    const choG = gramsOf(row.choG);
    const proteinG = gramsOf(row.proteinG);
    const fatG = gramsOf(row.fatG);
    const name = row.name.trim();
    if (choG === null || proteinG === null || fatG === null || name === '' || name.length > 40) {
      return null;
    }
    const code = row.code ?? profileCodeOf(name, taken);
    taken.add(code);
    profiles.push({ code, name, choG, proteinG, fatG });
  }
  return profiles;
}
