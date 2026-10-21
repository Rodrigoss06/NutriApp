import { err, ok, type Result } from '@nutricoach/shared-kernel';

/** Una actividad del Compendium 2024: la traducción propia junto a la descripción oficial y su MET. */
export interface CompendiumActivity {
  readonly code: string;
  readonly majorHeading: string;
  readonly descriptionEs: string;
  readonly descriptionEn: string;
  readonly met: number;
}

/** Encabezado de seeds/exercise/compendium-2024.csv. */
export const COMPENDIUM_COLUMNS = [
  'codigo',
  'encabezado',
  'descripcion',
  'met',
  'descripcion_en',
] as const;

/** Los encabezados que se cargan, por los dos primeros dígitos del código (decisión de Rodrigo, 2026-10-20). */
const HEADINGS: ReadonlyMap<string, string> = new Map([
  ['01', 'Ciclismo'],
  ['02', 'Acondicionamiento físico'],
  ['03', 'Baile'],
  ['12', 'Correr'],
  ['15', 'Deportes'],
  ['17', 'Caminar'],
  ['18', 'Actividades acuáticas'],
]);
const PREFIXES = [...HEADINGS.keys()];

const CODE = /^\d{5}$/;
/** El Compendium publica cada MET con un decimal; numeric(4,1) en la base. */
const MET = /^\d{1,2}\.\d$/;
const MAX_DESCRIPTION = 300;

/**
 * Una fila de seeds/exercise/compendium-2024.csv (RF-38). El MET y la descripción en inglés son los del Compendium,
 * sin cambios: el Compendium pide no alterar los MET ni mezclar actividades. La descripción en español es una
 * traducción propia.
 */
export function parseCompendiumRow(
  record: Readonly<Record<string, string>>,
): Result<CompendiumActivity, string[]> {
  const errors: string[] = [];
  const code = record.codigo ?? '';
  const heading = record.encabezado ?? '';
  const descriptionEs = (record.descripcion ?? '').trim();
  const descriptionEn = (record.descripcion_en ?? '').trim();
  const met = record.met ?? '';

  const expected = HEADINGS.get(code.slice(0, 2));
  if (!CODE.test(code) || !expected) {
    errors.push(
      `codigo: «${code}» no es de un encabezado que se cargue (${PREFIXES.slice(0, -1).join(', ')} o ${PREFIXES.at(-1) ?? ''})`,
    );
  } else if (heading !== expected) {
    errors.push(`encabezado: el código ${code} es de «${expected}», no de «${heading}»`);
  }
  if (!descriptionEs) errors.push('descripcion: vacía');
  else if (descriptionEs.length > MAX_DESCRIPTION) {
    errors.push(`descripcion: más de ${String(MAX_DESCRIPTION)} caracteres`);
  }
  if (!MET.test(met) || Number(met) <= 0) {
    errors.push(`met: «${met}» no es un MET del Compendium (número positivo con un decimal)`);
  }
  if (!descriptionEn) errors.push('descripcion_en: vacía');
  else if (descriptionEn.length > MAX_DESCRIPTION) {
    errors.push(`descripcion_en: más de ${String(MAX_DESCRIPTION)} caracteres`);
  }

  if (errors.length > 0) return err(errors);
  return ok({ code, majorHeading: heading, descriptionEs, descriptionEn, met: Number(met) });
}
