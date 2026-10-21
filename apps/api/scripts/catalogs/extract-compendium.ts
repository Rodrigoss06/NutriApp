/**
 * Extrae del PDF oficial del 2024 Adult Compendium of Physical Activities (pacompendium.com) las actividades de los
 * encabezados que se cargan y escribe seeds/exercise/compendium-2024.csv (P8, RF-38).
 *
 * Código, MET y descripción en inglés salen del PDF tal cual: el Compendium pide citarlo, no cambiar los MET y no
 * mezclar actividades. La descripción en español es una traducción propia, guiada por la traducción oficial de la
 * edición 2011: si el CSV ya existe, el extractor conserva la traducción de cada código cuyo MET y descripción en
 * inglés no cambiaron, y avisa de las que faltan o quedaron viejas. Así el PDF verifica el CSV cada vez.
 *
 * Una descripción larga puede venir partida: la línea de arriba, la del código (sin descripción) y la de abajo.
 *
 * Requiere pdftotext (poppler). Uso:
 *   node scripts/catalogs/extract-compendium.ts <compendium-2024.pdf> ../../seeds/exercise/compendium-2024.csv
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Los encabezados que se cargan (decisión de Rodrigo, 2026-10-20) y su nombre en español. */
export const HEADINGS: Readonly<Record<string, string>> = {
  Bicycling: 'Ciclismo',
  'Conditioning Exercise': 'Acondicionamiento físico',
  Dancing: 'Baile',
  Running: 'Correr',
  Sports: 'Deportes',
  Walking: 'Caminar',
  'Water Activities': 'Actividades acuáticas',
};
const EXPECTED = 560;

export interface CompendiumRow {
  readonly code: string;
  readonly heading: string;
  readonly met: string;
  readonly descriptionEn: string;
}

const ROW =
  /^\s*(?<heading>\S.*?)\s{2,}(?<code>\d{5})\s+(?<met>\d+\.\d+)(?:\s+(?<description>\S.*?))?\s*$/;
const PAGE_HEADER =
  /^(?:2024 Adult Compendium of Physical Activities|\s*Major Heading\s+Activity Code)/;

/** «8.00» → «8.0»: el Compendium publica un decimal y una fila trae dos. Falla si redondear cambiara el valor. */
const oneDecimal = (met: string): string => {
  const fixed = Number(met).toFixed(1);
  if (Number(fixed) !== Number(met)) throw new Error(`MET con más de un decimal: ${met}`);
  return fixed;
};

export function extract(text: string): CompendiumRow[] {
  const rows: CompendiumRow[] = [];
  let prefix: string[] = [];
  let awaiting: { code: string; heading: string; met: string; before: string } | null = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || PAGE_HEADER.test(line)) continue;
    const match = ROW.exec(line)?.groups;
    if (!match) {
      if (awaiting) {
        const { before, ...row } = awaiting;
        rows.push({
          ...row,
          descriptionEn: `${before} ${line.trim()}`.replace(/\s+/g, ' ').trim(),
        });
        awaiting = null;
      } else {
        prefix.push(line.trim());
      }
      continue;
    }
    const heading = match.heading ?? '';
    const code = match.code ?? '';
    const met = oneDecimal(match.met ?? '');
    if (match.description) {
      if (HEADINGS[heading]) rows.push({ code, heading, met, descriptionEn: match.description });
    } else if (HEADINGS[heading]) {
      awaiting = { code, heading, met, before: prefix.join(' ') };
    }
    prefix = [];
  }
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

/** Una línea de CSV con comillas; los CSV de seeds/ no tienen saltos de línea dentro de un campo. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line.charAt(i);
    if (quoted && char === '"' && line.charAt(i + 1) === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

const csvField = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const round1 = (value: number): string => value.toFixed(1);
const MPH_TO_KMH = 1.609344;
const LB_TO_KG = 0.45359237;
const INCH_TO_CM = 2.54;
const YARD_TO_M = 0.9144;

/** Pares «valor en la unidad original (equivalente)» de la traducción, con la conversión que debe cumplir. */
const CONVERSIONS: readonly { pattern: RegExp; convert: (value: number) => string }[] = [
  {
    pattern: /([<>]?)([\d.]+)(?:–([\d.]+))? mph \(\1()([\d.]+)(?:–([\d.]+))? km\/h\)/g,
    convert: (mph) => round1(mph * MPH_TO_KMH),
  },
  {
    pattern:
      /([<>~]?)([\d.]+)(?:–([\d.]+))? yardas por minuto \(\1()([\d.]+)(?:–([\d.]+))? m\/min\)/g,
    convert: (yards) => round1(yards * YARD_TO_M),
  },
  {
    pattern: /()([\d.]+)() min\/milla \(()([\d.]+)() min\/km\)/g,
    convert: (minPerMile) => round1(minPerMile / MPH_TO_KMH),
  },
  {
    pattern: /()([\d.]+)(?:–([\d.]+))? lb \(()([\d.]+)(?:–([\d.]+))? kg\)/g,
    convert: (lb) => round1(lb * LB_TO_KG),
  },
  {
    pattern: /()(\d+)(?:–(\d+))? pulgadas? \(()(\d+)(?:–(\d+))? cm\)/g,
    convert: (inches) => Math.round(inches * INCH_TO_CM).toString(),
  },
];

/**
 * Lo que la traducción debe conservar: cada número de la descripción oficial aparece en la traducción, y cada
 * equivalencia entre paréntesis (km/h, min/km, kg, cm, m/min) es la conversión exacta, redondeada a un decimal. Una
 * equivalencia que ya trae el Compendium se copia tal cual, aunque no sea exacta: no se corrige la fuente.
 */
export function checkTranslation(descriptionEn: string, descriptionEs: string): string[] {
  const problems: string[] = [];
  // Los ordinales del inglés («19th century») van en romanos o en letras: no se exigen.
  const numbers = (text: string) =>
    new Set(
      [...text.matchAll(/(\d+(?:\.\d+)?)(st|nd|rd|th)?/g)]
        .filter((m) => !m[2])
        .map((m) => m[1] ?? ''),
    );
  const inSpanish = numbers(descriptionEs);
  const inEnglish = numbers(descriptionEn);
  for (const number of inEnglish) {
    if (!inSpanish.has(number)) problems.push(`falta el número ${number}`);
  }
  for (const { pattern, convert } of CONVERSIONS) {
    for (const match of descriptionEs.matchAll(pattern)) {
      const [, , from, fromHigh, , to, toHigh] = match;
      if (from && to && !inEnglish.has(to) && convert(Number(from)) !== to) {
        problems.push(`«${match[0]}»: ${from} da ${convert(Number(from))}`);
      }
      if (fromHigh && toHigh && !inEnglish.has(toHigh) && convert(Number(fromHigh)) !== toHigh) {
        problems.push(`«${match[0]}»: ${fromHigh} da ${convert(Number(fromHigh))}`);
      }
      if (Boolean(fromHigh) !== Boolean(toHigh)) problems.push(`«${match[0]}»: rango incompleto`);
    }
  }
  // «X mph (Y km/h)», o «Y km/h (X mph)» cuando el Compendium ya trae los km/h.
  const mph = (descriptionEs.match(/ mph(?! \()(?!\))/g) ?? []).length;
  if (mph > 0) problems.push('mph sin su equivalente en km/h');
  return problems;
}

export const COLUMNS = ['codigo', 'encabezado', 'descripcion', 'met', 'descripcion_en'];

if (import.meta.main) {
  const [pdf, out] = process.argv.slice(2);
  if (!pdf || !out) {
    console.error(
      'Uso: node scripts/catalogs/extract-compendium.ts <compendium-2024.pdf> <salida.csv>',
    );
    process.exit(1);
  }
  const rows = extract(execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }));

  const translations = new Map<string, { es: string; en: string; met: string }>();
  if (existsSync(out)) {
    const [header, ...lines] = readFileSync(out, 'utf8').split('\n').filter(Boolean);
    if (header !== COLUMNS.join(',')) {
      throw new Error(`${out}: el encabezado debe ser ${COLUMNS.join(',')}`);
    }
    for (const line of lines) {
      const [code = '', , es = '', met = '', en = ''] = splitCsvLine(line);
      translations.set(code, { es, en, met });
    }
  }

  const missing: string[] = [];
  const stale: string[] = [];
  const lines = rows.map((row) => {
    const known = translations.get(row.code);
    let es = '';
    if (known?.es && known.en === row.descriptionEn && known.met === row.met) es = known.es;
    else if (known?.es)
      stale.push(`${row.code}: cambió el MET o la descripción en inglés; revisar la traducción`);
    else missing.push(row.code);
    for (const problem of es ? checkTranslation(row.descriptionEn, es) : []) {
      stale.push(`${row.code}: ${problem}`);
    }
    return [row.code, HEADINGS[row.heading] ?? '', es, row.met, row.descriptionEn]
      .map(csvField)
      .join(',');
  });
  writeFileSync(out, `${[COLUMNS.join(','), ...lines].join('\n')}\n`);

  const byHeading = Object.keys(HEADINGS)
    .map((h) => `${HEADINGS[h] ?? h}: ${String(rows.filter((r) => r.heading === h).length)}`)
    .join(' · ');
  console.log(`${String(rows.length)} actividades (${byHeading}) → ${out}`);
  const removed = [...translations.keys()].filter((code) => !rows.some((r) => r.code === code));
  for (const code of removed) console.log(`ya no está en el PDF: ${code}`);
  for (const note of stale) console.log(`revisar: ${note}`);
  if (missing.length > 0) {
    console.log(`sin traducción: ${String(missing.length)} (${missing.slice(0, 10).join(', ')}…)`);
  }
  if (rows.length !== EXPECTED) {
    console.log(`ERROR: se extrajeron ${String(rows.length)} y se esperaban ${String(EXPECTED)}`);
    process.exit(1);
  }
  if (new Set(rows.map((r) => r.code)).size !== rows.length) {
    console.log('ERROR: hay códigos repetidos');
    process.exit(1);
  }
}
