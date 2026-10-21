/**
 * Extrae la TAFERA 2016 («Tablas auxiliares para la formulación y evaluación de regímenes alimentarios», INS-CENAN,
 * 2.ª edición) del PDF oficial (P8, RF-38):
 *
 * - Módulo I (páginas 14 a 74): medidas caseras con su peso bruto y neto y el % de parte comestible, a
 *   tafera-2016-medidas.csv, cada una enlazada con su alimento de la TPCA 2017;
 * - Módulo II (páginas 77 a 84): factores de conversión de peso cocido a crudo, a tafera-2016-factores.csv.
 *
 * El módulo I es irregular: el nombre del alimento va centrado entre sus filas, una unidad puede ocupar dos líneas y
 * algunas medidas comparten un peso bruto entre dos filas, que son dos formas de comer el alimento (con y sin cáscara,
 * la unidad y su jugo) y se alternan fila por fila. Por eso se lee cada palabra con su posición (pdftotext -bbox) y no
 * el texto plano. Los nutrientes de cada fila son los de la TPCA 2009 por el peso neto: dentro de una forma, la energía
 * y los nutrientes por 100 g son constantes. Eso agrupa las filas y enlaza cada grupo con su alimento de la TPCA 2017
 * por perfil de nutrientes y nombre; lo que la regla automática no resuelve se fija a mano en LINKS. Los factores del
 * módulo II se enlazan por nombre, y a mano en FACTOR_LINKS.
 *
 * Convenciones de la publicación: «.» es sin dato y «-» no aplica; «*» tras el nombre o la unidad marca medidas y
 * pesos de la edición de 1985 (columna datos_1985); las letras griegas y las letras voladas remiten a notas al pie y se
 * quitan.
 *
 * Requiere pdftotext (poppler). Uso, desde apps/api:
 *   node scripts/catalogs/extract-tafera.ts <tafera-2016.pdf> ../../seeds/food [--revisar]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Word {
  readonly text: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const decode = (text: string): string =>
  text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

/** Las palabras de cada página con su caja (pdftotext -bbox). */
export function readPages(pdf: string, first: number, last: number): Word[][] {
  const html = execFileSync(
    'pdftotext',
    ['-f', String(first), '-l', String(last), '-bbox', pdf, '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return html
    .split('<page ')
    .slice(1)
    .map((page) =>
      [
        ...page.matchAll(
          /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g,
        ),
      ].map((m) => ({
        text: decode(m[5] ?? ''),
        x0: Number(m[1]),
        y0: Number(m[2]),
        x1: Number(m[3]),
        y1: Number(m[4]),
      })),
    );
}

export const cx = (w: Word): number => (w.x0 + w.x1) / 2;
export const cy = (w: Word): number => (w.y0 + w.y1) / 2;
const height = (w: Word): number => w.y1 - w.y0;

/** Agrupa palabras en líneas: misma altura, con tolerancia. */
export function lines(words: readonly Word[], tolerance = 2): Word[][] {
  const sorted = [...words].sort((a, b) => cy(a) - cy(b) || a.x0 - b.x0);
  const result: Word[][] = [];
  for (const word of sorted) {
    const line = result.at(-1);
    if (line && Math.abs(cy(word) - cy(line[0] as Word)) <= tolerance) line.push(word);
    else result.push([word]);
  }
  return result.map((line) => line.sort((a, b) => a.x0 - b.x0));
}

const text = (words: readonly Word[]): string => words.map((w) => w.text).join(' ');

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Las letras voladas (a, b, α, Θ…) remiten a notas: miden la mitad que el texto. */
const withoutSuperscripts = (words: readonly Word[]): Word[] => {
  const typical = median(words.map(height));
  return words.filter((w) => height(w) >= typical * 0.7);
};

const NOTE_SYMBOLS = /[Α-Ωα-ωώµÆ∆∞]/gu;

/** Cierra las comillas que la publicación abre con “ y cierra con ", y quita las que quedan sueltas. */
function balanceQuotes(value: string): string {
  let out = '';
  let open = -1;
  for (const ch of value) {
    if (ch === '“' || (ch === '"' && open < 0)) {
      open = out.length;
      out += '“';
    } else if (ch === '”' || ch === '"') {
      if (open >= 0) out += '”';
      open = -1;
    } else {
      out += ch;
    }
  }
  return open >= 0 ? out.slice(0, open) + out.slice(open + 1) : out;
}

/** Un nombre o una unidad sin notas: sin símbolos, sin «*» (que marca datos de 1985) y sin cortes de línea. */
export function cleanLabel(raw: string): { text: string; from1985: boolean } {
  const cleaned = raw
    .replace(NOTE_SYMBOLS, ' ')
    .replaceAll('*', ' ')
    .replace(/(\p{L})- (\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:)”])/g, '$1')
    .replace(/([(“])\s+/g, '$1')
    .trim();
  return { text: balanceQuotes(cleaned).replace(/[\s,]+$/, ''), from1985: raw.includes('*') };
}

/** Una unidad de consumo: además, sin comillas que la envuelvan, con mayúscula inicial y sin erratas evidentes. */
export function cleanUnit(raw: string): { text: string; from1985: boolean } {
  const label = cleanLabel(raw);
  const unwrapped = /^“[^“”]*”$/.test(label.text) ? label.text.slice(1, -1) : label.text;
  const fixed = unwrapped
    .replace(/^Ttaza/, 'Taza')
    .replace('Plàstico', 'plástico')
    .replace('enlzado', 'enlozado');
  return { ...label, text: fixed.charAt(0).toUpperCase() + fixed.slice(1) };
}

// Módulo I ------------------------------------------------------------------------------------------------------

/** Columnas numéricas en el orden de la tabla, con la unidad de su fila de unidades. */
const NUMERIC = [
  ['bruto', 'g'],
  ['neto', 'g'],
  ['energia', 'kcal'],
  ['proteinas', 'g'],
  ['grasa', 'g'],
  ['carbohidratos', 'g'],
  ['fibra', 'g'],
  ['calcio', 'mg'],
  ['zinc', 'mg'],
  ['hierro', 'mg'],
  ['vitamina_a', 'ug'],
  ['vitamina_c', 'mg'],
] as const;
type Column = (typeof NUMERIC)[number][0] | 'comestible';
const CODE = /^(\d{1,2})-(\d{1,3})$/;
const NUMBER = /^\d+(?:[.,]\d+)?$/;

export interface RawMeasure {
  readonly page: number;
  readonly code: string;
  readonly group: number;
  readonly position: number;
  readonly y: number;
  unit: string[];
  /** Valores por columna: número, null si «.» (sin dato) o «-» (no aplica), undefined si la celda está vacía. */
  values: Partial<Record<Column, number | null>>;
  /** El peso bruto o la unidad vienen compartidos con la fila vecina. */
  shared: boolean;
  /** Pesos brutos que la tabla pone entre esta fila y una vecina: candidatos a ser el suyo. */
  looseGross: number[];
}

export interface PageLayout {
  readonly centers: Readonly<Record<Column, number>>;
  /** Límite entre las columnas ALIMENTO y UNIDAD DE CONSUMO. */
  readonly nameUnitBoundary: number;
  /** Límite entre UNIDAD DE CONSUMO y la primera columna numérica. */
  readonly unitNumbersBoundary: number;
  /** Borde derecho de la columna COD. */
  readonly codeRight: number;
  /** Altura de la fila de encabezados: todo lo que está arriba no es dato. */
  readonly headerBottom: number;
}

/** Ubica las columnas con la fila de unidades («g g kcal g g g g mg mg mg ug mg») y los encabezados. */
export function layoutOf(words: readonly Word[]): PageLayout | null {
  const units = NUMERIC.map(([, unit]) => unit);
  for (const line of lines(words)) {
    const texts = line.map((w) => w.text);
    for (let i = 0; i + units.length <= texts.length; i += 1) {
      if (!units.every((unit, k) => texts[i + k] === unit)) continue;
      const row = line.slice(i, i + units.length);
      // Los encabezados COD., ALIMENTO y UNIDAD van en la misma línea; el título de la página también dice UNIDAD.
      const cod = words.find((w) => w.text === 'COD.');
      if (!cod) return null;
      const onCodLine = (w: Word) => Math.abs(cy(w) - cy(cod)) < 2;
      const comestible = words.find((w) => w.text === 'comestible');
      const alimento = words.find((w) => w.text === 'ALIMENTO' && onCodLine(w));
      const unidad = words.find((w) => w.text === 'UNIDAD' && onCodLine(w));
      if (!comestible || !alimento || !unidad) return null;
      const centers = Object.fromEntries([
        ...NUMERIC.map(([name], k) => [name, cx(row[k] as Word)]),
        ['comestible', cx(comestible)],
      ]) as Record<Column, number>;
      return {
        centers,
        nameUnitBoundary: (alimento.x1 + unidad.x0) / 2,
        unitNumbersBoundary: (row[0] as Word).x0 - 10,
        codeRight: cod.x1 + 2,
        headerBottom: Math.max(...row.map((w) => w.y1)),
      };
    }
  }
  return null;
}

const parseNumber = (raw: string): number => Number(raw.replace(',', '.'));

/** Un bloque de nombre de alimento: sus líneas juntas y su altura. */
export interface NameBlock {
  readonly page: number;
  readonly text: string;
  readonly top: number;
  readonly bottom: number;
}

const nearest = <T>(items: readonly T[], distance: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>(
    (best, item) => (best === undefined || distance(item) < distance(best) ? item : best),
    undefined,
  );

/** Las filas de medidas de una página y los bloques de nombre de alimento. */
export function parseMeasuresPage(
  words: readonly Word[],
  layout: PageLayout,
  page: number,
  notes: string[],
): { rows: RawMeasure[]; names: NameBlock[] } {
  const body = words.filter((w) => cy(w) > layout.headerBottom + 1);
  const rows: RawMeasure[] = body
    .filter((w) => CODE.test(w.text) && cx(w) < layout.codeRight + 4)
    .map((w) => {
      const [, group = '0', position = '0'] = CODE.exec(w.text) ?? [];
      return {
        page,
        code: w.text,
        group: Number(group),
        position: Number(position),
        y: cy(w),
        unit: [],
        values: {},
        shared: false,
        looseGross: [],
      };
    })
    .sort((a, b) => a.y - b.y);
  if (rows.length === 0) return { rows, names: [] };
  const last = (rows.at(-1) as RawMeasure).y;
  const data = body.filter(
    (w) => cy(w) < last + 9 && !(CODE.test(w.text) && cx(w) < layout.codeRight + 4),
  );
  const columns = Object.entries(layout.centers) as [Column, number][];
  const neighbours = (y: number): [RawMeasure | undefined, RawMeasure | undefined] => [
    [...rows].reverse().find((r) => r.y <= y),
    rows.find((r) => r.y > y),
  ];

  // Valores numéricos: columna por x y fila por y. Los superíndices (1 y 2 de las formas de un alimento) tienen letra
  // más chica: no son valores. Primero lo que está en la línea de una fila; después lo que queda entre dos filas.
  const numeric = data.filter((w) => cx(w) > layout.unitNumbersBoundary);
  const typical = median(numeric.filter((w) => NUMBER.test(w.text)).map(height));
  const cells: { word: Word; column: Column; value: number | null }[] = [];
  for (const word of numeric) {
    const raw = word.text.replace(/["”]+$/, '');
    if (!NUMBER.test(raw) && raw !== '.' && raw !== '-') continue;
    if (height(word) < typical * 0.8) continue;
    const [column] = nearest(columns, ([, x]) => Math.abs(x - cx(word))) ?? [];
    if (column) cells.push({ word, column, value: NUMBER.test(raw) ? parseNumber(raw) : null });
  }
  const onLine = (cell: (typeof cells)[number]) => {
    const row = nearest(rows, (r) => Math.abs(r.y - cy(cell.word)));
    return row && Math.abs(row.y - cy(cell.word)) <= 3 ? row : undefined;
  };
  const ownGross = new Set<RawMeasure>();
  for (const cell of cells) {
    const row = onLine(cell);
    if (!row) continue;
    if (row.values[cell.column] !== undefined)
      notes.push(`${row.code}: dos valores en ${cell.column}`);
    row.values[cell.column] = cell.value;
    if (cell.column === 'bruto') ownGross.add(row);
  }
  for (const cell of cells.filter((c) => !onLine(c))) {
    const y = cy(cell.word);
    const [above, below] = neighbours(y);
    const row = nearest(rows, (r) => Math.abs(r.y - y));
    if (!row) continue;
    if (cell.column === 'bruto') {
      // Un peso bruto entre dos filas es candidato de las dos: el de dos formas de comer el alimento (ciruela,
      // cocona) o uno de los de un corte con y sin pellejo (cuy, pollo).
      if (cell.value === null) continue;
      for (const neighbour of [above, below]) neighbour?.looseGross.push(cell.value);
      if (above && below && !ownGross.has(above) && !ownGross.has(below)) {
        above.shared = true;
        below.shared = true;
      }
    } else if (Math.abs(row.y - y) <= 8 && row.values[cell.column] === undefined) {
      row.values[cell.column] = cell.value;
    } else if (cell.column !== 'comestible') {
      // Un segundo % entre filas es el del corte sin pellejo: el de la medida es el que va en su línea.
      notes.push(`valor sin fila «${cell.word.text}» en ${cell.column} (página ${String(page)})`);
    }
  }
  // El peso bruto de cada fila: con el % comestible publicado, el candidato que lo reproduce (±5 puntos: la fuente
  // redondea promedios); el % de los cortes es el del peso con pellejo. Sin %, solo el de su línea. Si ninguno
  // coincide, queda sin peso bruto.
  for (const row of rows) {
    const net = row.values.neto;
    const pct = row.values.comestible;
    const own = row.values.bruto;
    const candidates = [own, ...row.looseGross].filter(
      (g): g is number => typeof g === 'number' && g > 0,
    );
    if (typeof net !== 'number' || candidates.length === 0) continue;
    if (typeof pct !== 'number') {
      row.values.bruto = typeof own === 'number' ? own : null;
      continue;
    }
    const best = nearest(candidates, (g) => Math.abs((net / g) * 100 - pct));
    row.values.bruto = best !== undefined && Math.abs((net / best) * 100 - pct) <= 5 ? best : null;
    if (row.values.bruto === null)
      notes.push(`${row.code}: ningún peso bruto da su ${String(pct)} % comestible`);
  }

  // Unidad de consumo: cada línea a la fila más cercana; entre dos filas que comparten el peso bruto, a las dos.
  const labels = withoutSuperscripts(
    data.filter((w) => cx(w) > layout.codeRight && cx(w) <= layout.unitNumbersBoundary),
  );
  const unitWords = labels.filter((w) => cx(w) > layout.nameUnitBoundary);
  for (const line of lines(unitWords)) {
    const y = cy(line[0] as Word);
    const row = nearest(rows, (r) => Math.abs(r.y - y));
    if (!row) continue;
    const [above, below] = neighbours(y);
    const between =
      above &&
      below &&
      Math.abs(above.y - y) > 3 &&
      Math.abs(below.y - y) > 3 &&
      above.shared &&
      below.shared;
    if (between) {
      above.unit.push(text(line));
      below.unit.push(text(line));
    } else {
      row.unit.push(text(line));
    }
  }

  // Nombres: líneas de la columna ALIMENTO, juntas si están a 9 puntos o menos, o a 12 si la línea sigue en minúscula
  // («Frijol canario» y «sancochado»). Las filas van cada 14 puntos. Una línea que empieza con mayúscula tras un nombre
  // de dos palabras o más que no termina en conector es otro alimento («Pan árabe de supermercado» y «Pan baguetino»;
  // «Avena» y «Hojuela cruda» son uno).
  const names: NameBlock[] = [];
  for (const line of lines(labels.filter((w) => cx(w) <= layout.nameUnitBoundary))) {
    const y = cy(line[0] as Word);
    const block = names.at(-1);
    const continues = /^\p{Ll}/u.test(text(line));
    const previous = block?.text ?? '';
    const another =
      /^\p{Lu}\p{Ll}/u.test(text(line)) &&
      previous.includes(' ') &&
      !/(,|-|\b(de|del|con|sin|y|en))$/u.test(previous);
    if (block && !another && (y - block.bottom <= 9 || (continues && y - block.bottom <= 12))) {
      names[names.length - 1] = { ...block, text: `${block.text} ${text(line)}`, bottom: y };
    } else {
      names.push({ page, text: text(line), top: y, bottom: y });
    }
  }
  return { rows, names };
}

/**
 * Las filas sin unidad propia que tienen nutrientes son una forma de una medida con varias formas (cocona, higo,
 * naranja): toman la unidad, y el peso bruto si lo comparten, de la fila vecina de la misma medida.
 */
export function inheritUnits(rows: readonly RawMeasure[], notes: string[]): void {
  // Solo de las unidades propias: una heredada no se vuelve a heredar (naranja tangelo, formas a y b).
  const own = new Set(rows.filter((r) => r.unit.length > 0));
  rows.forEach((row, i) => {
    if (row.unit.length > 0 || !hasEnergy(row)) return;
    const candidates = [rows[i - 1], rows[i + 1]].filter(
      (r): r is RawMeasure =>
        r !== undefined && r.page === row.page && r.group === row.group && own.has(r),
    );
    const source = nearest(candidates, (r) => Math.abs(r.y - row.y));
    if (!source) {
      notes.push(`${row.code}: sin unidad de consumo`);
      return;
    }
    row.unit = [...source.unit];
    if (row.values.bruto === undefined && source.values.bruto !== undefined && !hasEnergy(source)) {
      row.values.bruto = source.values.bruto;
    }
  });
}

/** Componentes con los que se compara el perfil de nutrientes, con la resolución con que los publica la tabla. */
const PROFILE = [
  ['energia', 1],
  ['proteinas', 0.1],
  ['grasa', 0.1],
  ['carbohidratos', 0.1],
  ['fibra', 0.1],
  ['calcio', 0.1],
  ['zinc', 0.1],
  ['hierro', 0.1],
  ['vitamina_a', 0.1],
  ['vitamina_c', 0.1],
] as const;
type Component = (typeof PROFILE)[number][0];
export type Profile = Partial<Record<Component, number>>;

/** Una medida con nutrientes: la fila, su nombre de alimento y sus valores por 100 g de peso neto. */
export interface Measure {
  readonly row: RawMeasure;
  readonly net: number;
  readonly per100g: Profile;
  food: string;
}

const hasEnergy = (row: RawMeasure): boolean => typeof row.values.energia === 'number';

const per100g = (row: RawMeasure, net: number): Profile =>
  Object.fromEntries(
    PROFILE.flatMap(([component]) => {
      const value = row.values[component];
      return typeof value === 'number' ? [[component, (value / net) * 100]] : [];
    }),
  );

/** ¿Dos medidas tienen el mismo perfil por 100 g, dentro de lo que permite el redondeo de la tabla? */
export function sameProfile(a: Measure, b: Measure): boolean {
  let compared = 0;
  for (const [component, resolution] of PROFILE) {
    const va = a.per100g[component];
    const vb = b.per100g[component];
    if (va === undefined || vb === undefined) continue;
    compared += 1;
    const tolerance =
      ((resolution / 2) * 100) / a.net + ((resolution / 2) * 100) / b.net + 0.02 * Math.max(va, vb);
    if (Math.abs(va - vb) > tolerance + 1e-9) return false;
  }
  return compared > 0;
}

/** Una forma de un alimento: las medidas con el mismo perfil por 100 g, que corresponden a un alimento de la TPCA. */
export interface FoodForm {
  readonly group: number;
  readonly measures: Measure[];
}

/** La medida de mayor peso neto: la de menor error de redondeo por 100 g. */
export const representative = (measures: readonly Measure[]): Measure =>
  measures.reduce((best, m) => (m.net > best.net ? m : best));

const pages = (measures: readonly Measure[]): number[] => measures.map((m) => m.row.page);

/**
 * Agrupa las filas con nutrientes en formas. Primero, tramos de filas seguidas con el mismo perfil; después, cada
 * tramo se une a una de las tres formas más recientes si tiene su perfil y está en la misma página o la siguiente: así
 * se juntan las formas que se alternan fila por fila (manzana con y sin cáscara).
 */
export function groupForms(rows: readonly RawMeasure[]): FoodForm[] {
  const segments: FoodForm[] = [];
  for (const row of rows) {
    const net = row.values.neto;
    if (!hasEnergy(row) || typeof net !== 'number' || net <= 0) continue;
    const measure: Measure = { row, net, per100g: per100g(row, net), food: '' };
    const current = segments.at(-1);
    if (
      current &&
      current.group === row.group &&
      sameProfile(representative(current.measures), measure)
    ) {
      current.measures.push(measure);
    } else {
      segments.push({ group: row.group, measures: [measure] });
    }
  }
  const forms: FoodForm[] = [];
  for (const segment of segments) {
    const first = Math.min(...pages(segment.measures));
    const target = forms
      .slice(-3)
      .reverse()
      .find(
        (form) =>
          form.group === segment.group &&
          first - Math.max(...pages(form.measures)) <= 1 &&
          sameProfile(representative(form.measures), representative(segment.measures)),
      );
    if (target) target.measures.push(...segment.measures);
    else forms.push({ group: segment.group, measures: [...segment.measures] });
  }
  return forms;
}

/**
 * Reparte filas ordenadas por altura en tramos seguidos, uno por bloque y en su orden, de modo que cada bloque quede lo
 * más centrado posible en su tramo. Con carry, un primer tramo puede seguir al alimento de la página anterior (-1).
 */
export function partition(
  ys: readonly number[],
  centers: readonly number[],
  carry: boolean,
): number[] {
  const n = ys.length;
  const m = centers.length;
  const y = (i: number) => ys[i] ?? 0;
  const c = (j: number) => centers[j] ?? 0;
  if (m === 0) return ys.map(() => -1);
  if (n < m) {
    return ys.map((v) =>
      centers.reduce((best, x, j) => (Math.abs(x - v) < Math.abs(c(best) - v) ? j : best), 0),
    );
  }
  // cost[j][i]: lo mínimo para repartir las primeras i filas entre la continuación y los bloques 0..j-1.
  const cost = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY),
  );
  const cut = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const at = (table: number[][], j: number, i: number) => table[j]?.[i] ?? Number.POSITIVE_INFINITY;
  for (let i = 0; i <= n; i += 1)
    (cost[0] as number[])[i] = i === 0 || carry ? 0 : Number.POSITIVE_INFINITY;
  for (let j = 1; j <= m; j += 1) {
    for (let i = j; i <= n; i += 1) {
      for (let k = j - 1; k < i; k += 1) {
        const total = at(cost, j - 1, k) + Math.abs(c(j - 1) - (y(k) + y(i - 1)) / 2);
        if (total < at(cost, j, i)) {
          (cost[j] as number[])[i] = total;
          (cut[j] as number[])[i] = k;
        }
      }
    }
  }
  const result = new Array<number>(n).fill(-1);
  let end = n;
  for (let j = m; j >= 1; j -= 1) {
    const start = at(cut, j, end);
    for (let r = start; r < end; r += 1) result[r] = j - 1;
    end = start;
  }
  return result;
}

/**
 * Pone a cada medida el nombre de su alimento. Las formas que se cruzan forman una zona, que incluye las filas sin
 * nutrientes que caen entre sus códigos (la forma que la tabla no calcula, como el jugo colado de la granadilla). Cada
 * bloque de nombre es de la zona de la fila más cercana a su centro; si esa fila no es de ninguna zona, el bloque nombra
 * filas que no se cargan. En cada página, las filas de una zona se reparten en tramos seguidos entre sus bloques, cada
 * uno centrado en su tramo (dos alimentos con el mismo perfil, como los fideos o las manzanas, comparten zona); las
 * filas de arriba pueden seguir al alimento de la página anterior. Una zona sin bloque propio toma el más cercano de su
 * página y queda en las notas.
 */
export function nameMeasures(
  forms: readonly FoodForm[],
  rows: readonly RawMeasure[],
  names: readonly NameBlock[],
  notes: string[],
): void {
  const index = new Map(rows.map((row, i) => [row, i]));
  const spans = forms
    .map((form) => {
      const indexes = form.measures.map((m) => index.get(m.row) ?? 0);
      return { forms: [form], from: Math.min(...indexes), to: Math.max(...indexes) };
    })
    .sort((a, b) => a.from - b.from);
  const zones: typeof spans = [];
  for (const span of spans) {
    const zone = zones.at(-1);
    if (zone && span.from <= zone.to) {
      zone.forms.push(...span.forms);
      zone.to = Math.max(zone.to, span.to);
    } else {
      zones.push({ ...span, forms: [...span.forms] });
    }
  }
  const zoneOf = (row: RawMeasure) => {
    const i = index.get(row) ?? -1;
    return zones.find((zone) => i >= zone.from && i <= zone.to);
  };
  const center = (block: NameBlock) => (block.top + block.bottom) / 2;
  const owner = new Map(
    names.map((block) => {
      const row = nearest(
        rows.filter((r) => r.page === block.page),
        (r) => Math.abs(r.y - center(block)),
      );
      return [block, row && zoneOf(row)];
    }),
  );
  const measureOf = new Map(forms.flatMap((form) => form.measures).map((m) => [m.row, m]));
  for (const zone of zones) {
    const zoneRows = rows.slice(zone.from, zone.to + 1);
    const own = names
      .filter((block) => owner.get(block) === zone)
      .sort((a, b) => a.page - b.page || center(a) - center(b));
    let carried: NameBlock | undefined;
    for (const page of [...new Set(zoneRows.map((r) => r.page))].sort((a, b) => a - b)) {
      const onPage = zoneRows.filter((r) => r.page === page).sort((a, b) => a.y - b.y);
      const blocks = own.filter((block) => block.page === page);
      // Sin bloque en la página: sigue el de la anterior o, al pie de una página, el primero de la siguiente.
      const fallback =
        carried ?? (blocks.length === 0 ? own.find((block) => block.page > page) : undefined);
      const runs = partition(
        onPage.map((r) => r.y),
        blocks.map(center),
        carried !== undefined,
      );
      onPage.forEach((row, i) => {
        const measure = measureOf.get(row);
        if (!measure) return;
        const run = runs[i] ?? -1;
        const block =
          run >= 0
            ? blocks[run]
            : (fallback ??
              nearest(
                names.filter((b) => b.page === page),
                (b) => Math.abs(center(b) - row.y),
              ));
        if (!block) notes.push(`${row.code}: sin nombre de alimento`);
        else if (run < 0 && fallback === undefined) {
          notes.push(`${row.code}: nombre tomado del bloque más cercano («${block.text}»)`);
        }
        measure.food = block?.text ?? '';
      });
      carried = blocks.at(-1) ?? carried;
    }
  }
}

// Enlace con la TPCA 2017 ---------------------------------------------------------------------------------------

export interface TpcaFood {
  readonly code: string;
  readonly group: string;
  readonly name: string;
  readonly profile: Profile;
}

/** Grupos de la TPCA 2017 de cada grupo de la TAFERA: siguen el orden de la TPCA 2009. */
const TPCA_GROUPS: Readonly<Record<number, readonly string[]>> = {
  1: ['A'],
  2: ['B'],
  3: ['C'],
  4: ['D'],
  5: ['E'],
  6: ['F'],
  7: ['G'],
  8: ['J'],
  9: ['K'],
  10: ['L', 'H', 'A', 'D'],
  11: ['T'],
  12: ['U'],
};

/** Una línea de CSV con comillas (los CSV de seeds no tienen saltos de línea dentro de un campo). */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/** Los alimentos de seeds/food/tpca-2017.csv con el perfil de los componentes de la TAFERA. */
export function readTpca(csv: string): TpcaFood[] {
  const [header = '', ...rows] = csv.trim().split('\n');
  const columns = splitCsvLine(header);
  return rows.map((line) => {
    const cells = splitCsvLine(line);
    const raw = (name: string) => cells[columns.indexOf(name)] ?? '';
    const value = (name: string): number | undefined => {
      const cell = raw(name);
      if (cell === '') return undefined;
      return cell === 'tr' ? 0 : Number(cell);
    };
    const total = value('CHOCDF');
    const fibre = value('FIBTG');
    const available =
      value('CHOAVL') ?? (total !== undefined && fibre !== undefined ? total - fibre : total);
    const entries: [Component, number | undefined][] = [
      ['energia', value('ENERC_KCAL')],
      ['proteinas', value('PROCNT')],
      ['grasa', value('FAT')],
      ['carbohidratos', available],
      ['fibra', fibre],
      ['calcio', value('CA')],
      ['zinc', value('ZN')],
      ['hierro', value('FE')],
      ['vitamina_a', value('VITA')],
      ['vitamina_c', value('VITC')],
    ];
    return {
      code: raw('codigo'),
      group: raw('grupo'),
      name: raw('nombre'),
      profile: Object.fromEntries(entries.filter(([, v]) => v !== undefined)),
    };
  });
}

/** Piso de cada componente para la diferencia relativa: por debajo, el redondeo pesa más que el dato. */
const FLOOR: Readonly<Record<Component, number>> = {
  energia: 10,
  proteinas: 0.5,
  grasa: 0.5,
  carbohidratos: 0.5,
  fibra: 0.5,
  calcio: 2,
  zinc: 0.2,
  hierro: 0.2,
  vitamina_a: 5,
  vitamina_c: 1,
};

/** Diferencia relativa media entre dos perfiles; infinita si comparten menos de tres componentes. */
export function profileDistance(a: Profile, b: Profile): number {
  let sum = 0;
  let compared = 0;
  for (const [component] of PROFILE) {
    const va = a[component];
    const vb = b[component];
    if (va === undefined || vb === undefined) continue;
    sum += Math.abs(va - vb) / Math.max(va, vb, FLOOR[component]);
    compared += 1;
  }
  return compared >= 3 ? sum / compared : Number.POSITIVE_INFINITY;
}

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'con',
  'sin',
  'en',
  'y',
  'o',
  'a',
]);

const tokens = (value: string): Set<string> =>
  new Set(
    value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^a-zñ]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );

/** Parecido de dos nombres: palabras en común sobre palabras distintas (Jaccard), sin tildes ni conectores. */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  const common = [...ta].filter((t) => tb.has(t)).length;
  const all = ta.size + tb.size - common;
  return all === 0 ? 0 : common / all;
}

export interface Candidate {
  readonly food: TpcaFood;
  readonly distance: number;
  readonly similarity: number;
}

/**
 * Lo que se enlaza: las medidas de una forma con el mismo nombre de alimento. Dos alimentos que la TAFERA calcula con
 * los mismos valores (granadilla e higo, queso fresco y requesón) comparten forma, pero cada uno se enlaza por su nombre.
 */
export interface LinkUnit {
  /** Código de la primera medida: la clave en LINKS. */
  readonly key: string;
  readonly form: FoodForm;
  readonly food: string;
  readonly measures: Measure[];
}

/** Clave de un nombre sin tildes, mayúsculas ni espacios: «Fideo tallarin» y «Fideo tallarín» son el mismo. */
const variantKey = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-zñ0-9]+/g, '');

const accents = (name: string): number => (name.match(/[áéíóúüñ]/giu) ?? []).length;

export function linkUnits(forms: readonly FoodForm[]): LinkUnit[] {
  const display = new Map<string, string>();
  for (const m of forms.flatMap((form) => form.measures)) {
    const name = cleanLabel(m.food).text;
    const best = display.get(variantKey(name));
    if (best === undefined || accents(name) > accents(best)) display.set(variantKey(name), name);
  }
  return forms.flatMap((form) => {
    const byFood = new Map<string, Measure[]>();
    for (const m of form.measures) {
      const key = variantKey(cleanLabel(m.food).text);
      byFood.set(key, [...(byFood.get(key) ?? []), m]);
    }
    return [...byFood].map(([key, measures]) => ({
      key: (measures[0] as Measure).row.code,
      form,
      food: display.get(key) ?? '',
      measures,
    }));
  });
}

/** Alimentos de la TPCA 2017 del mismo grupo, del perfil más parecido al menos parecido. */
export function candidates(unit: LinkUnit, tpca: readonly TpcaFood[]): Candidate[] {
  const profile = representative(unit.form.measures).per100g;
  return tpca
    .filter((food) => (TPCA_GROUPS[unit.form.group] ?? []).includes(food.group))
    .map((food) => ({
      food,
      distance: profileDistance(profile, food.profile),
      similarity: nameSimilarity(unit.food, food.name),
    }))
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Regla automática: el perfil más parecido si casi coincide y se distingue del segundo o el nombre lo respalda; si no,
 * el de nombre más parecido si su perfil está cerca. Lo demás queda para LINKS.
 */
export function autoLink(list: readonly Candidate[]): Candidate | undefined {
  const [first, second] = list;
  if (
    first &&
    first.distance < 0.03 &&
    (!second || second.distance - first.distance >= 0.015 || first.similarity >= 0.3)
  ) {
    return first;
  }
  const byName = list
    .slice(0, 3)
    .reduce<Candidate | undefined>(
      (best, c) => (best === undefined || c.similarity > best.similarity ? c : best),
      undefined,
    );
  if (
    byName &&
    first &&
    byName.similarity >= 0.6 &&
    byName.distance <= 0.15 &&
    byName.distance <= first.distance + 0.08
  ) {
    return byName;
  }
  return undefined;
}

/**
 * Enlaces fijados a mano, por el código de la primera medida de cada unidad de enlace: el código de la TPCA 2017, o
 * null si el alimento no tiene equivalente y sus medidas no se cargan.
 */
export const LINKS: Readonly<Record<string, string | null>> = {
  // 1. Cereales
  '1-79': 'A1', // Kiwicha cruda → Achita, kiwicha o achis
  '1-88': 'A36', // Maíz amarillo, harina de (cucharas) → Maíz, harina de, como sus tazas
  '1-92': 'A34', // Maíz fresco, unidad de → Maíz, grano fresco (choclo): la TPCA 2017 bajó de 201 a 104 kcal
  '1-98': 'A34', // Maíz fresco, granos de
  '1-128': 'A49', // Pan francés de panaderías → Pan francés fortificado con hierro
  '1-129': 'A49', // Pan francés de supermercados (la TAFERA trae otro perfil)
  '1-130': 'A49',
  '1-139': 'A49', // Pan tolete, calculado como pan francés
  '1-153': 'A59', // Quinua blanca, hojuela de → Quinua, hojuelas de
  '1-150': 'A54', // Quinua blanca cruda: una fila suelta del mismo alimento que 1-141
  '1-169': 'A63', // Trigo, harina de: una fila con 406 kcal por 100 g, errata de la fuente
  // 2. Verduras
  '2-1': null, // Acelga, atado: la TPCA 2017 separa hojas (B1) y tallos (B2)
  '2-16': 'B13', // Ajos → Ajo sin cáscara
  '2-20': 'B98', // Ajo, molido → Ajos variedad Napuri fresco, molido en agua sin sal
  '2-49': 'B35', // Col → Col, hojas de (mismo código que en la TPCA 2009)
  '2-51': 'B35', // Col, picada
  '2-52': 'B39', // Culantro → Culantro sin tallo
  '2-54': 'B45', // Espinaca negra picada → Espinaca negra sin tronco
  '2-55': 'B44', // Espinaca, hojas → Espinaca blanca
  '2-56': 'B44',
  '2-59': 'B68', // Perejil: la fuente repite los valores de la espinaca en dos filas
  '2-60': 'B68',
  '2-61': 'B68',
  '2-37': 'B29', // Cebolla de cabeza (roja): el perfil es el de la perilla (B102), manda el nombre, como su factor
  '2-40': 'B29',
  '2-62': 'B69', // Pimiento → Pimiento rojo (B69 era «Pimiento» en la TPCA 2009)
  '2-68': 'B80', // Tomate italiano (Marzano) → Tomate italiano
  '2-70': 'B80',
  '2-75': 'B84', // Vainitas
  '2-76': 'B84',
  // 3. Frutas
  '3-4': 'C100', // Aguaymanto (la TAFERA usó Capulí, la misma fruta)
  '3-7': 'C13', // Ciruela peruana → Ciruela
  '3-14': 'C15', // Agua de coco
  '3-33': 'C20', // Granadilla, pulpa con pepas
  '3-44': 'C27', // Higo fresco → Higo negro
  '3-48': null, // Higo fresco, unidad grande sin unidad propia en la fuente
  '3-50': 'C34', // Limón: el peso neto es el jugo
  '3-54': 'C111', // Limón dulce (lima), sin cáscara
  '3-55': 'C35', // Lúcuma seda → Lúcuma
  '3-62': 'C40', // Mandarina sin pepa → Mandarina
  '3-71': 'C116', // Manzana delicia roja con cáscara
  '3-78': 'C117', // Manzana israel con cáscara
  '3-85': 'C42', // Manzana israel en cubos, como sus otros cubos
  '3-88': 'C43', // Maracuyá → jugo puro
  '3-90': 'C43',
  '3-98': 'C52', // Níspero
  '3-100': 'C7', // Melocotón huayco → Durazno-Melocotón
  '3-109': null, // Naranja de Huando, zumo colado: la TPCA 2017 no trae su jugo
  '3-120': 'C54', // Pacae o guaba
  '3-134': 'C60', // Pasas negras → Pasa sin pepa
  '3-166': null, // Toronja, jugo de: la TPCA 2017 solo trae la fruta
  '3-171': 'C93', // Uva blanca (el perfil se parece más al de la uva negra; la nota de la fuente dice C-93)
  // 4. Grasas y oleaginosas
  '4-1': 'D9', // Aceite vegetal de soya: todos los aceites tienen el mismo perfil
  '4-9': 'D13', // Castaña peruana
  // 5. Pescados y mariscos
  '5-1': 'E1', // Almeja → Almeja blanca
  '5-12': null, // Boquichico fresco: la TPCA 2017 solo trae el salado deshidratado
  '5-15': null,
  '5-18': null,
  '5-36': 'E6', // Camarón de río → Camarones frescos
  '5-42': 'E7', // Cangrejo
  '5-43': 'E12', // Concha de abanico
  '5-69': null, // Palometa: no está en la TPCA 2017
  '5-72': 'E63', // Pejerrey
  // 6. Carnes
  '6-20': null, // Conejo y cuy, corazón e hígado: la fuente usó los del pollo; no hay equivalente
  '6-26': null,
  '6-47': null,
  '6-53': null,
  '6-44': 'F74', // Cuy, cabeza de → Cuy, carne de
  '6-52': 'F74', // Cuy, ½ espinazo de
  '6-56': 'F74', // Cuy, ½ lomo de
  '6-59': 'F74', // Cuy, pescuezo de
  '6-62': 'F74', // Cuy, pierna de
  '6-77': 'F78', // Pollo, ala de → Pollo, alas con piel, crudas (la fuente calculó con la carne pulpa)
  '6-80': 'F78', // Pollo, brazuelo de
  '6-83': 'F78', // Pollo, ala-brazuelo de
  '6-127': 'F40', // Res, mondongo picado → Res, panza de (mondongo)
  // 7 a 10. Lácteos, huevos, azucarados y misceláneas
  '7-20': null, // Queso edam: no está en la TPCA 2017
  '7-25': null, // Requesón: la fuente usó el queso fresco de vaca; no hay equivalente
  '7-28': 'G16', // Queso parmesano rallado → Queso parmesano duro
  '8-1': 'J12', // Huevo de codorniz, entero crudo
  '9-18': 'K7', // Mermelada de fresa → Mermelada frutilla
  '9-20': 'K4', // Miel de abeja
  '10-1': null, // Galleta de agua: no está en la TPCA 2017
  '10-8': 'A24', // Galleta de soda (salada)
  '10-11': null, // Mayonesa: no está en la TPCA 2017
  // 11. Leguminosas
  '11-1': 'T2', // Arvejas frescas en vainas: el peso neto son los granos
  '11-2': 'T2', // Arveja fresca (guisantes)
  '11-6': 'T2',
  '11-8': 'T3', // Arveja seca partida → Arveja, seca sin cáscara
  '11-14': 'T61', // Arveja seca partida sancochada → Arveja verde partida sancochada
  '11-26': 'T64', // Frijol castilla sancochado
  '11-31': 'T15', // Frijol canario
  '11-37': 'T16', // Frijol canario sancochado → cocido
  '11-41': 'T26', // Frijol negro
  '11-57': 'T31', // Frijol panamito
  '11-65': 'T71', // Frijol panamito sancochado
  '11-70': 'T77', // Frijol zarandaja sancochado
  '11-85': null, // Haba fresca con cáscara: la TPCA 2017 solo trae habas sin cáscara
  '11-90': 'T47', // Haba fresca sin cáscara
  '11-94': 'T49', // Haba seca partida → Habas secas sin cáscara
  '11-100': 'T50', // Haba seca sancochada → Habas secas sin cáscara cocida
  '11-101': 'T50',
  '11-104': null, // Haba tostada: la fuente usó las habas secas crudas
  '11-110': 'T52', // Lenteja chica
  '11-112': 'T53', // Lenteja chica sancochada → cocidas
  '11-116': 'T54', // Lenteja grande
  '11-122': null, // Lenteja grande sancochada: la TPCA 2017 no la trae
  '11-123': null,
  '11-128': 'T56', // Pallar → Pallar seco
  '11-129': 'T56',
  // 12. Tubérculos
  '12-14': 'U6', // Camote, harina de
  '12-23': 'U54', // Harina de chuño → Papa, chuño negro, harina de (la fuente calculó con el chuño)
  '12-32': 'U16', // Mashua
  '12-35': 'U50', // Oca → Oca sin cáscara
  '12-37': 'U50',
  '12-78': 'U34', // Yuca amarilla
  '12-87': 'U38', // Yuca, harina de
};

/**
 * Unidades de las medidas con dos pesos netos para un mismo peso bruto, según las notas de la fuente: los dos llevan la
 * misma unidad y se distinguen por la parte comestible.
 */
export const UNIT_NAMES: Readonly<Record<string, string>> = {
  '2-70': 'Unidad mediana sin cáscara', // tomate, nota β
  '5-1': 'Unidad pequeña con bolsa digestiva y gónadas', // almeja, nota α
  '5-2': 'Unidad pequeña sin bolsa digestiva ni gónadas',
  '5-3': 'Unidad mediana con bolsa digestiva y gónadas',
  '5-4': 'Unidad mediana sin bolsa digestiva ni gónadas',
  '5-5': 'Unidad grande con bolsa digestiva y gónadas',
  '5-6': 'Unidad grande sin bolsa digestiva ni gónadas',
  '5-36': 'Unidad pequeña: cola, cabeza y tenazas', // camarón de río, nota δ
  '5-37': 'Unidad pequeña: solo la cola',
  '5-38': 'Unidad mediana: cola, cabeza y tenazas',
  '5-39': 'Unidad mediana: solo la cola',
  '5-40': 'Unidad grande: cola, cabeza y tenazas',
  '5-41': 'Unidad grande: solo la cola',
  '5-80': 'Unidad con cabeza y cola', // trucha, nota λ
  '5-81': 'Filete, unidad sin cabeza ni cola',
  '5-84': 'Unidad con cabeza y cola',
  '5-85': 'Filete, unidad sin cabeza ni cola',
  '5-88': 'Unidad con cabeza y cola',
  '5-89': 'Filete, unidad sin cabeza ni cola',
};

/** Nombres fijados a mano cuando el bloque más cercano es de otro alimento. */
export const FOOD_NAMES: Readonly<Record<string, string>> = {
  '7-23': 'Queso fresco de vaca', // el nombre del queso de cabra queda centrado más cerca de su tercera tajada
};

// Módulo II -----------------------------------------------------------------------------------------------------

/** Un factor de conversión de peso cocido a crudo: peso crudo = peso cocido × factor. */
export interface CookingFactor {
  readonly page: number;
  /** Grupo de la tabla, de su columna GRUPO: decide los grupos de la TPCA donde buscar el alimento. */
  readonly group: string;
  /** Alimento con su subgrupo («Pollo, ala») y la forma de las notas («Camarón de río, solo la cola»). */
  readonly food: string;
  readonly method: string;
  readonly factor: number;
  readonly from1985: boolean;
}

/** Subgrupos de las tablas de carnes, pescados y huevos: los que nombran al animal se anteponen al alimento. */
const SUBGROUPS: Readonly<Record<string, string | null>> = {
  POLLO: 'Pollo',
  'LLAMA / ALPACA': null,
  RES: 'Res',
  CARNERO: 'Carnero',
  CONEJO: 'Conejo',
  CUY: 'Cuy',
  CERDO: 'Cerdo',
  PATO: 'Pato',
  PAVO: 'Pavo',
  'HUEVO DE CODORNIZ': 'Huevo de codorniz',
  'HUEVO DE GALLINA': 'Huevo de gallina',
  PESCADO: null,
  'CRUSTÁCEOS Y MOLUSCOS': null,
};

/** Notas del módulo II que distinguen formas de un mismo alimento. */
const FACTOR_NOTES: Readonly<Record<string, string>> = {
  ω: 'con bolsa digestiva y gónadas',
  φ: 'entero',
  φφ: 'solo la cola',
  π: 'sin cabeza ni vísceras',
};

/** Grupos de la TPCA 2017 según la etiqueta de la columna GRUPO. */
const FACTOR_GROUPS: readonly [RegExp, readonly string[]][] = [
  [/CEREALES/, ['A']],
  [/VERDURAS/, ['B']],
  [/FRUTAS/, ['C']],
  [/PESCADOS/, ['E']],
  [/CARNES/, ['F']],
  [/HUEVOS/, ['J']],
  [/OLEAGI/, ['D']],
  [/LEGUMINOSAS/, ['T']],
  [/TUB[EÉ]RCULOS/, ['U']],
];

const FACTOR = /^\d+,\d+$/;
const isUpper = (value: string): boolean => /^[A-ZÁÉÍÓÚÑ ,/]+$/u.test(value);

/** Las tablas de una página: una por encabezado ALIMENTO, con sus columnas y sus filas, de arriba abajo. */
export function parseFactorsPage(
  words: readonly Word[],
  page: number,
  notes: string[],
): CookingFactor[] {
  const heads = words
    .filter((w) => w.text === 'ALIMENTO')
    .flatMap((alimento) => {
      const near = (w: Word) => Math.abs(cy(w) - cy(alimento)) < 14;
      const grupo = words
        .filter((w) => w.text === 'GRUPO' && w.x1 < alimento.x0 && near(w))
        .sort((a, b) => b.x0 - a.x0)[0];
      const coccion = words
        .filter((w) => w.text === 'COCCIÓN' && w.x0 > alimento.x1 && near(w))
        .sort((a, b) => a.x0 - b.x0)[0];
      const conversion = coccion
        ? words
            .filter((w) => w.text === 'CONVERSIÓN' && w.x0 > coccion.x1 - 5 && near(w))
            .sort((a, b) => a.x0 - b.x0)[0]
        : undefined;
      if (!grupo || !coccion || !conversion) {
        notes.push(`página ${String(page)}: encabezado incompleto`);
        return [];
      }
      return [
        { alimento, grupo, conversion, bottom: Math.max(conversion.y1, coccion.y1, alimento.y1) },
      ];
    })
    .sort((a, b) => cy(a.alimento) - cy(b.alimento) || a.alimento.x0 - b.alimento.x0);
  const factors: CookingFactor[] = [];
  for (const head of heads) {
    const sameRow = heads.filter((o) => Math.abs(cy(o.alimento) - cy(head.alimento)) < 20);
    const right = Math.min(
      ...sameRow.filter((o) => o.grupo.x0 > head.grupo.x0 + 10).map((o) => o.grupo.x0 - 5),
    );
    const below = heads.filter(
      (o) => cy(o.alimento) > cy(head.alimento) + 20 && Math.abs(o.grupo.x0 - head.grupo.x0) < 20,
    );
    const bottom = Math.min(...below.map((o) => o.alimento.y0 - 12));
    const inside = words.filter(
      (w) => cx(w) >= head.grupo.x0 - 5 && cx(w) < right && w.y0 > head.bottom && cy(w) < bottom,
    );
    // La etiqueta del grupo va en mayúsculas a la izquierda de los alimentos.
    const label = inside.filter((w) => cx(w) < head.alimento.x0 && isUpper(w.text));
    const groupLabel = label.map((w) => w.text).join(' ');
    const rows: {
      y: number;
      food: string;
      method: string;
      factor: number;
      from1985: boolean;
      sub: string | null;
    }[] = [];
    const marks: { y: number; note: string }[] = [];
    let sub: string | null = null;
    for (const line of lines(
      inside.filter((w) => !label.includes(w)),
      2.5,
    )) {
      const factor = line.find(
        (w) => FACTOR.test(w.text) && Math.abs(cx(w) - cx(head.conversion)) < 25,
      );
      const rest = line.filter((w) => w !== factor);
      const content = text(rest);
      if (!factor) {
        const key = Object.keys(SUBGROUPS).find((name) => content.includes(name));
        if (key !== undefined) sub = SUBGROUPS[key] ?? null;
        else if (FACTOR_NOTES[content] !== undefined)
          marks.push({ y: cy(line[0] as Word), note: content });
        continue;
      }
      // Alimento y tipo de cocción: separados por el mayor espacio de la línea.
      let cut = rest.length;
      let gap = 0;
      for (let i = 1; i < rest.length; i += 1) {
        const width = (rest[i] as Word).x0 - (rest[i - 1] as Word).x1;
        if (width > gap) {
          gap = width;
          cut = i;
        }
      }
      const name = cleanLabel(text(rest.slice(0, cut)));
      const prefix =
        sub !== null && !variantKey(name.text).startsWith(variantKey(sub)) ? sub : null;
      const item = prefix
        ? `${prefix}, ${name.text.charAt(0).toLowerCase()}${name.text.slice(1)}`
        : name.text;
      rows.push({
        y: cy(factor),
        food: item,
        method: cleanLabel(text(rest.slice(cut))).text,
        factor: parseNumber(factor.text),
        from1985: name.from1985,
        sub,
      });
    }
    for (const mark of marks) {
      const row = nearest(rows, (r) => Math.abs(r.y - mark.y));
      if (row && Math.abs(row.y - mark.y) < 8)
        row.food = `${row.food}, ${FACTOR_NOTES[mark.note] ?? ''}`;
    }
    factors.push(
      ...rows.map(({ food, method, factor, from1985 }) => ({
        page,
        group: groupLabel,
        food,
        method,
        factor,
        from1985,
      })),
    );
  }
  return factors;
}

/** Alimentos de la TPCA 2017 de los grupos de la tabla, del nombre más parecido al menos parecido. */
export function factorCandidates(factor: CookingFactor, tpca: readonly TpcaFood[]): Candidate[] {
  const groups = FACTOR_GROUPS.find(([pattern]) => pattern.test(factor.group))?.[1] ?? [];
  return tpca
    .filter((food) => groups.includes(food.group))
    .map((food) => ({ food, distance: 0, similarity: nameSimilarity(factor.food, food.name) }))
    .sort((a, b) => b.similarity - a.similarity);
}

/** Regla automática del módulo II: el nombre más parecido si se parece bastante y se distingue del segundo. */
export function autoLinkFactor(list: readonly Candidate[]): Candidate | undefined {
  const [first, second] = list;
  return first &&
    first.similarity >= 0.5 &&
    (!second || first.similarity - second.similarity >= 0.15)
    ? first
    : undefined;
}

/**
 * Enlaces del módulo II fijados a mano, por alimento: el código de la TPCA 2017 del alimento crudo al que se aplica el
 * factor, o null si no tiene equivalente y el factor no se carga.
 */
export const FACTOR_LINKS: Readonly<Record<string, string | null>> = {
  // Cereales
  'Avena, hojuelas de': 'A7',
  'Cebada perlada': 'A18', // Cebada perlada o resbalada cruda
  'Fideo cabello de angel': 'A21', // Fideo crudo fortificado con hierro
  'Fideo corbata': 'A21',
  'Fideo entrefino': 'A21',
  'Fideo especial de huevo': 'A139', // Pasta con huevo sin fortificar, cruda
  'Fideo tallarín delgado': 'A22', // Fideo tallarín crudo fortificado con hierro
  'Fideo tallarín grueso': 'A22',
  Kiwicha: 'A1', // el grano, no la harina
  Maíz: null, // tostado: la fuente no dice qué maíz
  'Maíz mote': 'A41', // Maíz, para mote pelado (crudo)
  'Maíz pelado seco': 'A41',
  Pan: null, // frito: la fuente no dice qué pan
  'Quinua blanca': 'A54', // como sus medidas
  'Quinua roja': 'A60',
  // Verduras
  Acelga: null, // la TPCA 2017 separa hojas y tallos, como en sus medidas
  Apio: 'B17',
  'Cebolla china': 'B28', // Cebollita china
  Col: 'B35', // como sus medidas
  Coliflor: 'B38', // Coliflor sin tallo y sin hojas
  Culantro: 'B39',
  Espárrago: 'B43',
  'Frijolito chino': 'B46', // Frejolito chino germinado
  Pacchoy: 'B114', // Pacchoy con hojas y tallo
  'Pimiento fresco': 'B69',
  // Frutas
  'Guindones secos': 'C109', // Guindón
  'Huesillo seco': null, // no está en la TPCA 2017
  'Plátano bellaco maduro': 'C135', // como sus medidas
  'Plátano bellaco verde': 'C78',
  // Pescados y mariscos
  'Almeja, con bolsa digestiva y gónadas': 'E1',
  'Boquichico, trozo mediano': null, // como sus medidas: solo el salado deshidratado
  'Caballa, filete': 'E35', // Pescado caballa, fresco
  'Caballa, trozo mediano': 'E35',
  'Camarón de río, entero': 'E6', // Camarones frescos
  'Camarón de río, solo la cola': 'E6',
  'Conchas de abanico': 'E12',
  'Huevera de cojinova': null, // la TPCA 2017 no trae la huevera de cojinova
  Jurel: 'E50', // Pescado jurel, fresco
  Lorna: 'E53', // Pescado lorna, fresco
  Merluza: 'E57', // Pescado merluza, fresco
  'Merluza filete': 'E57',
  'Merluza, filete': 'E57',
  'Merluza, trozo mediano': 'E57',
  Palometa: null, // no está en la TPCA 2017
  Toyo: 'E78', // Pescado toyo, fresco
  Trucha: 'E81', // Pescado trucha rosada, como sus medidas
  // Carnes
  'Carnero, carne': 'F12', // Carnero, pulpa semigorda, como sus medidas
  'Carnero, charqui': 'F46', // Carnero, carne seca sin hueso (chalona)
  'Carnero, seso': 'F9',
  'Cerdo, chicharon': 'F13', // el chicharrón se pesa crudo como carne de cerdo
  'Cerdo, chuleta': 'F13', // como sus medidas
  'Cerdo, pata': 'F15',
  'Cerdo, pellejo': 'F70', // Cerdo, cuero
  'Conejo, carne, sin cabeza ni vísceras': 'F19',
  'Cuy, carne, sin cabeza ni vísceras': 'F74',
  'Llama/alpaca, charqui de': 'F76',
  'Pato, corazón': null, // la TPCA 2017 no trae las vísceras del pato
  'Pato, hígado': null,
  'Pato, molleja': null,
  'Pato, pata': null,
  'Pollo, ala': 'F78', // Pollo, alas con piel, crudas, como sus medidas
  'Pollo, ala - brazuelo': 'F78',
  'Pollo, brazuelo': 'F78',
  'Pollo, entero con menudencia': 'F26', // Pollo, carne pulpa, como sus medidas
  'Pollo, entero sin menudencia': 'F26',
  'Pollo, entrepierna de': 'F26',
  'Pollo, espinazo de': 'F26',
  'Pollo, filete': 'F26',
  'Pollo, pechuga, trozo de': 'F26',
  'Pollo, pescuezo de': 'F26',
  'Pollo, pierna': 'F26',
  'Pollo, rabadilla': 'F26',
  'Res, carne': 'F35', // Res, carne pulpa de
  'Res, carne molida (hamburguesa)': 'F89', // Res, carne cruda molida
  'Res, criadilla': 'F37',
  'Res, seso': 'F44',
  // Oleaginosas
  Maní: 'D14', // crudo, no el sancochado
  // Leguminosas
  'Arveja fresca': 'T2',
  'Arveja seca partida': 'T3',
  'Frijol canario': 'T15',
  'Frijol castilla': 'T20',
  'Frijol negro': 'T26',
  'Frijol panamito': 'T31',
  'Frijol zarandaja': 'T9',
  'Haba fresca con cáscara': null, // como sus medidas
  'Haba fresca sin cáscara': 'T47',
  'Haba seca con cáscara': 'T48', // Habas secas con cáscara cruda
  'Haba seca partida': 'T49',
  'Lenteja chica': 'T52',
  'Lenteja grande': 'T54',
  'Pallar seco (con cáscara)': 'T56',
  'Pallar seco (sin cáscara)': 'T57',
  // Tubérculos
  'Oca, entero': 'U50',
  'Olluco, picado tipo juliana': 'U17',
  Yacón: 'U10', // Llacón
  'Yuca amarilla, bastones': 'U34',
  'Yuca amarilla, trozo': 'U34',
  'Yuca blanca, bastones': 'U36',
  'Yuca blanca, trozo': 'U36',
};

// Salida --------------------------------------------------------------------------------------------------------

const csvField = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const csvLine = (cells: readonly (string | number | null | undefined)[]): string =>
  cells.map((cell) => csvField(cell === null || cell === undefined ? '' : String(cell))).join(',');

if (import.meta.main) {
  const [pdf, out, flag] = process.argv.slice(2);
  if (!pdf || !out) {
    console.error(
      'Uso: node scripts/catalogs/extract-tafera.ts <tafera-2016.pdf> <carpeta seeds/food> [--revisar]',
    );
    process.exit(1);
  }
  const review = flag === '--revisar';
  const notes: string[] = [];
  const rows: RawMeasure[] = [];
  const names: NameBlock[] = [];
  readPages(pdf, 14, 74).forEach((words, i) => {
    const layout = layoutOf(words);
    if (!layout) {
      notes.push(`página ${String(14 + i)}: sin encabezados`);
      return;
    }
    const page = parseMeasuresPage(words, layout, 14 + i, notes);
    rows.push(...page.rows);
    names.push(...page.names);
  });
  rows.sort((a, b) => a.group - b.group || a.position - b.position);
  // La fuente repite un código (11-91 dos veces, sin 11-92): la segunda fila toma el siguiente si falta.
  const codes = new Set(rows.map((r) => r.code));
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    if (!seen.has(row.code)) {
      seen.add(row.code);
      return;
    }
    const next = `${String(row.group)}-${String(row.position + 1)}`;
    if (codes.has(next)) {
      notes.push(`ERROR: ${row.code} repetido`);
      return;
    }
    notes.push(`${row.code} repetido: la segunda fila es ${next}, que falta en la fuente`);
    rows[i] = { ...row, code: next, position: row.position + 1 };
    codes.add(next);
    seen.add(next);
  });
  inheritUnits(rows, notes);
  const forms = groupForms(rows);
  nameMeasures(forms, rows, names, notes);
  for (const m of forms.flatMap((form) => form.measures)) m.food = FOOD_NAMES[m.row.code] ?? m.food;
  const units = linkUnits(forms);

  const tpca = readTpca(readFileSync(join(out, 'tpca-2017.csv'), 'utf8'));
  const unresolved: string[] = [];
  const linked: { unit: LinkUnit; code: string }[] = [];
  for (const unit of units) {
    const list = candidates(unit, tpca);
    const auto = autoLink(list);
    const manual = LINKS[unit.key];
    const code = manual === undefined ? auto?.food.code : manual;
    if (code === undefined) unresolved.push(unit.key);
    else if (code !== null) linked.push({ unit, code });
    if (review || code === undefined) {
      const kcal = Math.round(representative(unit.form.measures).per100g.energia ?? 0);
      const how = manual === undefined ? (auto ? 'auto' : '¿?') : 'manual';
      const size = String(unit.measures.length);
      console.log(
        `${unit.key} (${size}) ${how} → ${code ?? '-'} | ${unit.food} | ${String(kcal)} kcal`,
      );
      for (const c of list.slice(0, 4)) {
        console.log(
          `    ${c.food.code} d${c.distance.toFixed(3)} n${c.similarity.toFixed(2)} ${c.food.name}`,
        );
      }
      for (const m of unit.measures) {
        const label = cleanUnit(m.row.unit.join(' ')).text;
        console.log(`      · ${m.row.code} p${String(m.row.page)} ${label} | ${String(m.net)} g`);
      }
    }
  }
  const stale = Object.keys(LINKS).filter((key) => !units.some((unit) => unit.key === key));
  if (stale.length > 0) unresolved.push(...stale.map((key) => `${key} (en LINKS, sin unidad)`));
  const withNutrients = rows.filter(hasEnergy).length;
  const measures = linked.reduce((n, { unit }) => n + unit.measures.length, 0);
  console.log(
    `${String(rows.length)} filas, ${String(withNutrients)} con nutrientes, ${String(forms.length)} formas, ` +
      `${String(units.length)} unidades de enlace; ${String(linked.length)} enlazadas con ${String(measures)} ` +
      `medidas; sin resolver: ${String(unresolved.length)}`,
  );
  for (const note of notes) console.log(`nota: ${note}`);
  if (notes.some((note) => note.startsWith('ERROR'))) process.exit(1);
  if (unresolved.length > 0) {
    console.log(`ERROR: formas sin enlace: ${unresolved.join(', ')}`);
    process.exit(1);
  }
  const header = [
    'codigo',
    'codigo_tpca',
    'alimento',
    'unidad',
    'medida',
    'peso_bruto_g',
    'peso_neto_g',
    'parte_comestible_pct',
    'energia_kcal',
    'datos_1985',
  ];
  // Un alimento de la TPCA con medidas de varios de la TAFERA (los fideos, los cortes de pollo) lleva el de la TAFERA
  // entre paréntesis en cada medida.
  const sources = new Map<string, Set<string>>();
  for (const { unit, code } of linked) {
    sources.set(code, (sources.get(code) ?? new Set()).add(unit.food));
  }
  const output = linked
    .flatMap(({ unit, code }) => unit.measures.map((m) => ({ m, code, food: unit.food })))
    .sort((a, b) => a.m.row.group - b.m.row.group || a.m.row.position - b.m.row.position)
    .map(({ m, code, food: name }) => {
      const food = cleanLabel(m.food);
      const unit = cleanUnit(m.row.unit.join(' '));
      const label = UNIT_NAMES[m.row.code] ?? unit.text;
      return csvLine([
        m.row.code,
        code,
        name,
        unit.text,
        (sources.get(code)?.size ?? 0) > 1 ? `${label} (${name})` : label,
        m.row.values.bruto,
        m.net,
        m.row.values.comestible,
        m.row.values.energia,
        food.from1985 || unit.from1985 ? 'si' : 'no',
      ]);
    });

  const factorNotes: string[] = [];
  const factors = readPages(pdf, 77, 84).flatMap((words, i) =>
    parseFactorsPage(words, 77 + i, factorNotes),
  );
  const pending: string[] = [];
  const factorRows: string[] = [];
  factors.forEach((factor, i) => {
    const list = factorCandidates(factor, tpca);
    const auto = autoLinkFactor(list);
    const manual = FACTOR_LINKS[factor.food];
    const code = manual === undefined ? auto?.food.code : manual;
    if (code === undefined) pending.push(factor.food);
    if (review || code === undefined) {
      const how = manual === undefined ? (auto ? 'auto' : '¿?') : 'manual';
      const top = list
        .slice(0, 3)
        .map((c) => `${c.food.code} n${c.similarity.toFixed(2)} ${c.food.name}`);
      console.log(
        `II ${how} → ${code ?? '-'} | ${factor.food} | ${factor.method} ${String(factor.factor)} | ${top.join(' · ')}`,
      );
    }
    if (code === undefined || code === null) return;
    factorRows.push(
      csvLine([
        `II-${String(i + 1).padStart(3, '0')}`,
        code,
        factor.food,
        factor.method,
        factor.factor,
        factor.from1985 ? 'si' : 'no',
      ]),
    );
  });
  const staleFactors = Object.keys(FACTOR_LINKS).filter(
    (food) => !factors.some((f) => f.food === food),
  );
  console.log(
    `${String(factors.length)} factores; ${String(factorRows.length)} enlazados; sin resolver: ` +
      `${String(new Set(pending).size)} alimentos`,
  );
  for (const note of factorNotes) console.log(`nota: ${note}`);
  if (pending.length > 0 || staleFactors.length > 0) {
    console.log(`ERROR: factores sin enlace: ${[...new Set(pending), ...staleFactors].join(', ')}`);
    process.exit(1);
  }
  // Los dos archivos se escriben solo si los dos módulos quedaron enlazados.
  writeFileSync(
    join(out, 'tafera-2016-medidas.csv'),
    `${[header.join(','), ...output].join('\n')}\n`,
  );
  const factorHeader = ['codigo', 'codigo_tpca', 'alimento', 'coccion', 'factor', 'datos_1985'];
  writeFileSync(
    join(out, 'tafera-2016-factores.csv'),
    `${[factorHeader.join(','), ...factorRows].join('\n')}\n`,
  );
}
