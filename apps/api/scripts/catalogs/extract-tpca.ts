/**
 * Extrae la TPCA 2017 (INS-CENAN, 10.ª edición) del PDF oficial a seeds/food/tpca-2017.csv (P8, RF-38).
 *
 * Cada alimento ocupa dos páginas enfrentadas: la izquierda trae código, nombre y las 8 primeras columnas (energía en
 * kcal y kJ, agua, proteínas, grasa total, carbohidratos totales y disponibles y fibra dietaria); la derecha, las 14
 * restantes y el código al final. Se unen por código. Cada valor va a la columna que tiene encima en la fila de
 * unidades: hay celdas vacías, sin «•», y contar valores las correría de columna.
 *
 * Convenciones de la publicación: «•» es «sin dato» (RN-I03) y queda vacío en el CSV; «0,0» es cero o trazas; «Tr,»
 * (una sola vez) son trazas y queda como «tr». Los asteriscos tras el nombre marcan datos imputados de otras tablas,
 * con la leyenda de cada grupo: * INCAP 2012, ** Tabla Boliviana 2005, *** Tabla Uruguaya, **** FAO. Van en la
 * columna imputado_de y se quitan del nombre. El grupo S (preparaciones del INEI) no se extrae: queda fuera por ahora
 * (decisión de Rodrigo, 2026-10-20).
 *
 * Nada se corrige: las diferencias de la propia publicación (kJ que no es kcal × 4,184, por ejemplo) se listan para
 * dejarlas documentadas en seeds/README.md.
 *
 * Requiere pdftotext y pdfinfo (poppler). Uso:
 *   node scripts/catalogs/extract-tpca.ts <tpca-2017.pdf> ../../seeds/food/tpca-2017.csv
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/** Columnas en el orden de la publicación, con su identificador INFOODS (Anexo 1). */
export const TPCA_NUTRIENTS = [
  'ENERC_KCAL',
  'ENERC_KJ',
  'WATER',
  'PROCNT',
  'FAT',
  'CHOCDF',
  'CHOAVL',
  'FIBTG',
  'ASH',
  'CA',
  'P',
  'ZN',
  'FE',
  'CARTBEQ',
  'VITA',
  'THIA',
  'RIBF',
  'NIA',
  'VITC',
  'FOL',
  'NA',
  'K',
] as const;
type Nutrient = (typeof TPCA_NUTRIENTS)[number];

const LEFT_UNITS = ['kcal', 'kJ', 'g', 'g', 'g', 'g', 'g', 'g'];
const RIGHT_UNITS = [
  'g',
  'mg',
  'mg',
  'mg',
  'mg',
  'µg',
  'µg',
  'mg',
  'mg',
  'mg',
  'mg',
  'µg',
  'mg',
  'mg',
];
export const GROUPS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'Q',
  'T',
  'U',
] as const;
const EXPECTED_FOODS = 928;
const IMPUTED_FROM: Readonly<Record<number, string>> = {
  1: 'Tabla INCAP 2012',
  2: 'Tabla Boliviana 2005',
  3: 'Tabla Uruguaya',
  4: 'FAO',
};

const VALUE = /^(?:\d+(?:,\d+)?|•|Tr,?)$/;

interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const tokensOf = (line: string): Token[] =>
  [...line.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));

const center = (token: Token): number => (token.start + token.end) / 2;

/** Centros de las columnas, tomados de la fila de unidades de la página («kcal kJ g g …» o «g mg mg …»). */
function columnCenters(lines: readonly string[], units: readonly string[]): number[] | null {
  for (const line of lines) {
    const tokens = tokensOf(line);
    const texts = tokens.map((t) => t.text);
    for (let i = 0; i + units.length <= texts.length; i += 1) {
      if (units.every((unit, k) => texts[i + k] === unit)) {
        return tokens.slice(i, i + units.length).map(center);
      }
    }
  }
  return null;
}

/** Asigna cada valor a la columna más cercana; falla si dos valores caen en la misma columna. */
function assign(values: readonly Token[], centers: readonly number[]): (string | null)[] | string {
  const cells: (string | null)[] = centers.map(() => null);
  for (const value of values) {
    let best = 0;
    for (let k = 1; k < centers.length; k += 1) {
      if (
        Math.abs(center(value) - (centers[k] ?? 0)) < Math.abs(center(value) - (centers[best] ?? 0))
      )
        best = k;
    }
    if (cells[best] !== null) return `dos valores en la columna ${String(best + 1)}`;
    cells[best] = value.text;
  }
  return cells;
}

/** «12,8» → «12.8»; «•» o celda vacía → «» (sin dato); «Tr,» → «tr» (trazas). */
const normalize = (cell: string | null): string => {
  if (cell === null || cell === '•') return '';
  if (/^Tr,?$/.test(cell)) return 'tr';
  return cell.replace(',', '.');
};

export interface TpcaFood {
  readonly code: string;
  readonly group: string;
  readonly name: string;
  readonly imputedFrom: string;
  readonly values: Readonly<Record<Nutrient, string>>;
}

interface Half {
  name?: string;
  stars?: number;
  cells: (string | null)[];
}

function pageText(pdf: string, page: number): string {
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', pdf, '-'], {
    encoding: 'utf8',
  });
}

export function extract(pdf: string, pages: number): { foods: TpcaFood[]; notes: string[] } {
  const left = new Map<string, Half>();
  const right = new Map<string, Half>();
  const notes: string[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const lines = pageText(pdf, page).split('\n');
    const leftCenters = columnCenters(lines, LEFT_UNITS);
    const rightCenters = columnCenters(lines, RIGHT_UNITS);
    const isLeft = leftCenters !== null && lines.some((l) => l.includes('NOMBRE DEL ALIMENTO'));
    const isRight = rightCenters !== null && lines.some((l) => l.includes('<THIA>'));
    if (!isLeft && !isRight) continue;
    let previous: Half | null = null;
    for (const line of lines) {
      const tokens = tokensOf(line);
      if (isLeft) {
        const [group, number] = tokens;
        const firstColumn = (leftCenters[0] ?? 0) - 6;
        const isRow =
          group &&
          number &&
          /^[A-Z]$/.test(group.text) &&
          /^\d+$/.test(number.text) &&
          group.start < 12;
        if (isRow) {
          if (!GROUPS.includes(group.text as (typeof GROUPS)[number])) {
            previous = null;
            continue;
          }
          const nameTokens = tokens.slice(2).filter((t) => t.end <= firstColumn);
          const values = tokens.slice(2).filter((t) => t.end > firstColumn);
          const bad = values.find((t) => !VALUE.test(t.text));
          const code = `${group.text}${number.text}`;
          if (bad) {
            notes.push(`${code}: valor no reconocido «${bad.text}» en la página ${String(page)}`);
            continue;
          }
          const cells = assign(values, leftCenters);
          if (typeof cells === 'string') {
            notes.push(`${code}: ${cells} (página ${String(page)})`);
            continue;
          }
          const raw = nameTokens.map((t) => t.text).join(' ');
          const stars = /(\*+)$/.exec(raw)?.[1]?.length ?? 0;
          if (left.has(code)) notes.push(`${code}: código repetido en la página ${String(page)}`);
          const half: Half = { name: raw.replace(/\*+$/, '').trim(), stars, cells };
          left.set(code, half);
          previous = half;
          continue;
        }
        // Un nombre largo puede seguir en la línea siguiente, sin código ni valores.
        const nameOnly =
          tokens.length > 0 && tokens.every((t) => t.end <= firstColumn && t.start > 8);
        if (previous && nameOnly && !line.includes('<')) {
          previous.name = `${previous.name ?? ''} ${tokens.map((t) => t.text).join(' ')}`.trim();
          notes.push(`nombre en dos líneas: «${previous.name}»`);
        } else if (tokens.length > 0) {
          previous = null;
        }
      } else if (isRight) {
        const number = tokens.at(-1);
        const group = tokens.at(-2);
        if (!group || !number || !/^[A-Z]$/.test(group.text) || !/^\d+$/.test(number.text)) {
          continue;
        }
        if (!GROUPS.includes(group.text as (typeof GROUPS)[number])) continue;
        const values = tokens.slice(0, -2);
        const code = `${group.text}${number.text}`;
        const bad = values.find((t) => !VALUE.test(t.text));
        if (bad) {
          notes.push(`${code}: valor no reconocido «${bad.text}» en la página ${String(page)}`);
          continue;
        }
        const cells = assign(values, rightCenters);
        if (typeof cells === 'string') {
          notes.push(`${code}: ${cells} (página ${String(page)})`);
          continue;
        }
        right.set(code, { cells });
      }
    }
  }

  const foods: TpcaFood[] = [];
  for (const [code, half] of left) {
    const other = right.get(code);
    if (!other) {
      notes.push(`${code}: sin la mitad derecha`);
      continue;
    }
    const raw = [...half.cells, ...other.cells].map(normalize);
    const values = Object.fromEntries(
      TPCA_NUTRIENTS.map((nutrient, index) => [nutrient, raw[index] ?? '']),
    ) as Record<Nutrient, string>;
    foods.push({
      code,
      group: code.charAt(0),
      name: half.name ?? '',
      imputedFrom: IMPUTED_FROM[half.stars ?? 0] ?? '',
      values,
    });
  }
  for (const code of right.keys())
    if (!left.has(code)) notes.push(`${code}: sin la mitad izquierda`);
  foods.sort(
    (a, b) =>
      GROUPS.indexOf(a.group as (typeof GROUPS)[number]) -
        GROUPS.indexOf(b.group as (typeof GROUPS)[number]) ||
      Number(a.code.slice(1)) - Number(b.code.slice(1)),
  );
  return { foods, notes };
}

const num = (value: string): number | null =>
  value === '' || value === 'tr' ? null : Number(value);

/**
 * Verificaciones cruzadas. «error»: lo que delataría una extracción mala (conteo). «fuente»: diferencias de la propia
 * publicación, que se conservan tal cual y se documentan.
 */
export function check(foods: readonly TpcaFood[]): { errors: string[]; source: string[] } {
  const errors: string[] = [];
  const source: string[] = [];
  if (foods.length !== EXPECTED_FOODS) {
    errors.push(
      `Se extrajeron ${String(foods.length)} alimentos y la publicación dice ${String(EXPECTED_FOODS)}`,
    );
  }
  if (new Set(foods.map((f) => f.code)).size !== foods.length) errors.push('Hay códigos repetidos');
  for (const food of foods) {
    if (!food.name) errors.push(`${food.code}: sin nombre`);
    const v = Object.fromEntries(
      Object.entries(food.values).map(([key, value]) => [key, num(value)]),
    ) as Record<Nutrient, number | null>;
    if (
      v.ENERC_KCAL !== null &&
      v.ENERC_KJ !== null &&
      Math.abs(v.ENERC_KJ - v.ENERC_KCAL * 4.184) > 3
    ) {
      source.push(
        `${food.code}: ${String(v.ENERC_KCAL)} kcal y ${String(v.ENERC_KJ)} kJ (kcal × 4,184 = ${(v.ENERC_KCAL * 4.184).toFixed(0)})`,
      );
    }
    if (
      v.CHOCDF !== null &&
      v.CHOAVL !== null &&
      v.FIBTG !== null &&
      Math.abs(v.CHOCDF - v.FIBTG - v.CHOAVL) > 0.15
    ) {
      source.push(
        `${food.code}: disponibles ${String(v.CHOAVL)} g y totales − fibra = ${(v.CHOCDF - v.FIBTG).toFixed(1)} g`,
      );
    }
    const proximal = [v.WATER, v.PROCNT, v.FAT, v.CHOCDF, v.ASH];
    if (proximal.every((x) => x !== null) && food.group !== 'H') {
      const total = proximal.reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 8) {
        source.push(`${food.code}: la suma proximal da ${total.toFixed(1)} g`);
      }
    }
  }
  return { errors, source };
}

const csvField = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

if (import.meta.main) {
  const [pdf, out] = process.argv.slice(2);
  if (!pdf || !out) {
    console.error('Uso: node scripts/catalogs/extract-tpca.ts <tpca-2017.pdf> <salida.csv>');
    process.exit(1);
  }
  const pages = Number(
    /Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))?.[1],
  );
  const { foods, notes } = extract(pdf, pages);
  const { errors, source } = check(foods);
  const header = ['codigo', 'grupo', 'nombre', 'imputado_de', ...TPCA_NUTRIENTS];
  const lines = foods.map((food) =>
    [
      food.code,
      food.group,
      food.name,
      food.imputedFrom,
      ...TPCA_NUTRIENTS.map((n) => food.values[n]),
    ]
      .map(csvField)
      .join(','),
  );
  writeFileSync(out, `${[header.join(','), ...lines].join('\n')}\n`);
  const byGroup = GROUPS.map(
    (g) => `${g}:${String(foods.filter((f) => f.group === g).length)}`,
  ).join(' ');
  console.log(`${String(foods.length)} alimentos (${byGroup}) → ${out}`);
  for (const note of notes) console.log(`nota: ${note}`);
  for (const issue of source) console.log(`fuente: ${issue}`);
  for (const error of errors) console.log(`ERROR: ${error}`);
  if (errors.length > 0) process.exit(1);
}
