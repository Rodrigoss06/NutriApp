import {
  BIA_METRIC_LABELS,
  BIA_UNIT_LABELS,
  methodLabel,
  METRIC_LABELS,
  METRIC_NUMBER_KINDS,
  METRIC_UNIT_LABELS,
  SITE_NUMBER_KINDS,
  TREND_MAX_MONTHS,
  type BiaUnit,
  type EvolutionResponse,
  type NumberKind,
  type TrendMonth,
} from '@nutricoach/contracts';

/** Busca un código en una tabla de etiquetas: uno que no está vuelve como undefined, no se inventa. */
const lookup = <T>(labels: Readonly<Record<string, T>>, code: string): T | undefined =>
  (labels as Readonly<Record<string, T | undefined>>)[code];

/**
 * El nombre de un indicador con su método (RN-D02): «% de grasa (Durnin & Womersley (1974) + Siri)», sin repetir cuando el
 * método ya lleva el nombre del indicador, como «Masa ósea (Rocha)» (ADR-069).
 */
export function metricName(metricCode: string, methodCode: string): string {
  const metric = lookup(METRIC_LABELS, metricCode) ?? metricCode;
  const method = methodLabel(methodCode);
  return method === metric || method.startsWith(`${metric} `) ? method : `${metric} (${method})`;
}

/** Cómo se muestra el número de una serie: con su redondeo (RN-D09) o tal como lo dio el equipo de bioimpedancia. */
export type SeriesFormat =
  { readonly type: 'number'; readonly kind: NumberKind } | { readonly type: 'reading' };

/** Una serie que se puede dibujar: una sola por gráfico, así nunca se mezclan métodos (RN-D03, RN-C08). */
export interface SeriesOption {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly format: SeriesFormat;
  /** El método del número, para mostrarlo al lado (RN-D02); null en la bioimpedancia, que es una lectura del equipo. */
  readonly methodCode: string | null;
  readonly points: readonly { readonly localDate: string; readonly value: number }[];
}

const pointsOf = (series: { points: readonly { localDate: string; value: number }[] }) =>
  series.points.map(({ localDate, value }) => ({ localDate, value }));

/**
 * Las series que tienen evolución (dos puntos o más), en el orden de la pantalla: la suma de 6 pliegues, los sitios, los
 * indicadores por método y la bioimpedancia por equipo.
 */
export function seriesOptions(evolution: EvolutionResponse): SeriesOption[] {
  const options: SeriesOption[] = [];
  if (evolution.skinfoldSum6 && evolution.skinfoldSum6.points.length > 1) {
    options.push({
      key: 'SUM6',
      label: 'Suma de 6 pliegues',
      unit: 'mm',
      format: { type: 'number', kind: 'length' },
      methodCode: 'CONSOLIDATE_ISAK',
      points: pointsOf(evolution.skinfoldSum6),
    });
  }
  for (const site of evolution.sites) {
    if (site.points.length < 2) continue;
    options.push({
      key: `SITE:${site.siteCode}`,
      label: site.name,
      unit: site.unit,
      format: { type: 'number', kind: SITE_NUMBER_KINDS[site.unit] },
      methodCode: 'CONSOLIDATE_ISAK',
      points: pointsOf(site),
    });
  }
  for (const metric of evolution.metrics) {
    if (metric.points.length < 2) continue;
    options.push({
      key: `METRIC:${metric.metricCode}:${metric.methodCode}`,
      label: metricName(metric.metricCode, metric.methodCode),
      unit: lookup(METRIC_UNIT_LABELS, metric.unit) ?? metric.unit,
      format: { type: 'number', kind: lookup(METRIC_NUMBER_KINDS, metric.metricCode) ?? 'index' },
      methodCode: metric.methodCode,
      points: pointsOf(metric),
    });
  }
  for (const reading of evolution.bia) {
    if (reading.points.length < 2) continue;
    options.push({
      key: `BIA:${reading.device}:${reading.metric}`,
      label: `${lookup(BIA_METRIC_LABELS, reading.metric) ?? reading.metric} · ${reading.device}`,
      unit: BIA_UNIT_LABELS[reading.unit],
      format: { type: 'reading' },
      methodCode: null,
      points: pointsOf(reading),
    });
  }
  return options;
}

/** Las fechas de las evaluaciones de cada mes (YYYY-MM): la tendencia de RN-G09 se lee junto a ellas. */
export function evaluationsByMonth(
  evaluations: EvolutionResponse['evaluations'],
): ReadonlyMap<string, readonly string[]> {
  const months = new Map<string, string[]>();
  for (const { localDate } of evaluations) {
    const month = localDate.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), localDate]);
  }
  return months;
}

const monthIndex = (date: string): number => {
  const [year = 0, month = 1] = date.split('-').map(Number);
  return year * 12 + month - 1;
};
const monthStart = (index: number): string =>
  `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`;

/**
 * El rango de la tendencia por mes (RN-G09): desde el mes de la primera evaluación hasta hoy, como máximo los 24 meses que
 * acepta la API; sin evaluaciones, los últimos 12 meses.
 */
export function trendRange(
  evaluations: EvolutionResponse['evaluations'],
  today: string,
): { from: string; to: string } {
  const last = monthIndex(today);
  const first = evaluations[0] ? monthIndex(evaluations[0].localDate) : last - 11;
  return { from: monthStart(Math.max(first, last - (TREND_MAX_MONTHS - 1))), to: today };
}

/** Un mes de la tabla de tendencia: sus evaluaciones y, si el paciente registró algo, su tendencia (RN-G09). */
export interface TrendRow {
  readonly month: string;
  readonly evaluations: readonly string[];
  readonly trend: TrendMonth | null;
}

/**
 * Los meses con registros o con evaluaciones, del más reciente al más antiguo: un mes con una evaluación aparece aunque el
 * paciente no haya registrado nada, para leer la evolución junto a la tendencia.
 */
export function trendRows(
  months: readonly TrendMonth[],
  evaluations: EvolutionResponse['evaluations'],
): TrendRow[] {
  const byMonth = evaluationsByMonth(evaluations);
  const trends = new Map(months.map((month) => [month.month, month]));
  return [...new Set([...trends.keys(), ...byMonth.keys()])]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({
      month,
      evaluations: byMonth.get(month) ?? [],
      trend: trends.get(month) ?? null,
    }));
}

/** Una fila de la comparativa física: de la primera evaluación a la última (P14.5, PR 6a; ADR-107). */
export interface ComparisonRow {
  readonly key: string;
  readonly name: string;
  /** Un número con su redondeo (RN-D09) y su unidad, o la lectura de bioimpedancia tal como la dio el equipo (RN-C08). */
  readonly format:
    | { readonly type: 'number'; readonly kind: NumberKind; readonly unit: string }
    | { readonly type: 'reading'; readonly unit: BiaUnit };
  readonly first: { readonly localDate: string; readonly value: number };
  readonly last: { readonly localDate: string; readonly value: number };
  readonly change: number;
  /** RN-C06 en las medidas; null en un número derivado o en una lectura de bioimpedancia. */
  readonly significance: EvolutionResponse['sites'][number]['points'][number]['significance'];
}

const COMPARED_SITES = [
  ['BASIC_WEIGHT', 'Peso'],
  ['GIRTH_WAIST', 'Cintura'],
  ['GIRTH_HIP', 'Cadera'],
] as const;

interface Comparable {
  readonly points: readonly { readonly localDate: string; readonly value: number }[];
  readonly overall: {
    readonly change: number;
    readonly significance: ComparisonRow['significance'];
  } | null;
}

function comparisonOf(
  series: Comparable,
  row: Pick<ComparisonRow, 'key' | 'name' | 'format'>,
  measured: boolean,
): ComparisonRow[] {
  const first = series.points[0];
  const last = series.points.at(-1);
  if (!first || !last || series.points.length < 2 || !series.overall) return [];
  return [
    {
      ...row,
      first: { localDate: first.localDate, value: first.value },
      last: { localDate: last.localDate, value: last.value },
      change: series.overall.change,
      significance: measured ? series.overall.significance : null,
    },
  ];
}

/**
 * La comparativa física de la hoja de Jeremy (P14.5, PR 6a; ADR-107): peso, cintura y cadera con su CMD95 (RN-C06), y el % de grasa
 * de cada método y de cada equipo de bioimpedancia por separado (RN-D03, RN-C08). Solo lo que tiene dos evaluaciones o más.
 */
export function physicalComparison(evolution: EvolutionResponse): ComparisonRow[] {
  const sites = COMPARED_SITES.flatMap(([siteCode, name]) => {
    const site = evolution.sites.find((candidate) => candidate.siteCode === siteCode);
    return site
      ? comparisonOf(
          site,
          {
            key: siteCode,
            name,
            format: { type: 'number', kind: SITE_NUMBER_KINDS[site.unit], unit: site.unit },
          },
          true,
        )
      : [];
  });
  const fat = evolution.metrics
    .filter((metric) => metric.metricCode === 'FAT_PCT')
    .flatMap((metric) =>
      comparisonOf(
        metric,
        {
          key: `FAT_PCT:${metric.methodCode}`,
          name: metricName(metric.metricCode, metric.methodCode),
          format: {
            type: 'number',
            kind: lookup(METRIC_NUMBER_KINDS, metric.metricCode) ?? 'percent',
            unit: lookup(METRIC_UNIT_LABELS, metric.unit) ?? metric.unit,
          },
        },
        false,
      ),
    );
  const bia = evolution.bia
    .filter((reading) => reading.metric === 'FAT_PCT')
    .flatMap((reading) =>
      comparisonOf(
        reading,
        {
          key: `BIA:${reading.device}`,
          name: `% de grasa por bioimpedancia (${reading.deviceLabel})`,
          format: { type: 'reading', unit: reading.unit },
        },
        false,
      ),
    );
  return [...sites, ...fat, ...bia];
}
