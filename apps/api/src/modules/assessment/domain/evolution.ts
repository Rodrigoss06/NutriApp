import {
  conditionDifferences,
  significance,
  type ComparedEvaluation,
  type ConditionDifference,
  type Significance,
} from './comparison.js';

/** Una evaluación cerrada vigente, con lo que entra en la evolución (RF-35). */
export interface EvolutionInput {
  readonly evaluationId: string;
  /** YYYY-MM-DD, fecha local de la medición (RN-G04). */
  readonly localDate: string;
  readonly compared: ComparedEvaluation;
  /** Los valores consolidados de los sitios medidos (RN-C03). */
  readonly sites: ReadonlyMap<string, number>;
  /** El CMD95 de cada sitio con el ETM del evaluador de esta evaluación en su fecha (RN-C05); sin ETM, no está. */
  readonly siteMdc95: ReadonlyMap<string, number>;
  /** La suma de los 6 pliegues si están los seis, y su CMD95 con el %ETM agrupado de sus pares (G-04). */
  readonly skinfoldSum6: number | null;
  readonly skinfoldSum6Mdc95: number | null;
  /** Los indicadores de sus resultados vigentes, cada uno con su método (RN-D02). */
  readonly metrics: readonly {
    readonly metricCode: string;
    readonly methodCode: string;
    readonly unit: string;
    readonly value: number;
  }[];
  /** Las lecturas de bioimpedancia, rotuladas con su equipo (RN-C08). */
  readonly bia: readonly {
    readonly device: string;
    readonly metric: string;
    readonly deviceLabel: string;
    readonly unit: string;
    readonly value: number;
  }[];
}

export interface EvolutionPoint {
  readonly evaluationId: string;
  readonly localDate: string;
  readonly value: number;
  /** Contra el punto anterior de la misma serie; null en el primero. */
  readonly change: number | null;
  /** Solo en las medidas: el CMD95 del evaluador de este punto (RN-C05). */
  readonly mdc95: number | null;
  /** RN-C06: un cambio que no pasa el CMD95 es «sin cambio significativo». null si la serie no es de una medida. */
  readonly significance: Significance | null;
}

export interface EvolutionSeries {
  readonly points: readonly EvolutionPoint[];
  /** Del primer punto al último, con el CMD95 del último; null con un solo punto. */
  readonly overall: {
    readonly change: number;
    readonly mdc95: number | null;
    readonly significance: Significance | null;
  } | null;
}

export interface SiteSeries extends EvolutionSeries {
  readonly siteCode: string;
}

export interface MetricSeries extends EvolutionSeries {
  readonly metricCode: string;
  readonly methodCode: string;
  readonly unit: string;
}

export interface BiaSeries extends EvolutionSeries {
  readonly device: string;
  readonly metric: string;
  readonly deviceLabel: string;
  readonly unit: string;
}

export interface Evolution {
  /** Las evaluaciones en orden, con lo que cambió en sus condiciones frente a la anterior (RN-C09). */
  readonly evaluations: readonly {
    readonly evaluationId: string;
    readonly localDate: string;
    readonly conditionDifferences: readonly ConditionDifference[];
  }[];
  readonly sites: readonly SiteSeries[];
  readonly skinfoldSum6: EvolutionSeries | null;
  readonly metrics: readonly MetricSeries[];
  readonly bia: readonly BiaSeries[];
}

interface RawPoint {
  readonly evaluationId: string;
  readonly localDate: string;
  readonly value: number;
  readonly mdc95: number | null;
}

/**
 * Una serie con el cambio de cada punto contra el anterior y del primero al último. `measured` dice si es una medida: solo
 * entonces se compara con el CMD95 (RN-C06). En un número derivado, como el % de grasa, el CMD95 no se traslada (RN-C05).
 */
function seriesOf(points: readonly RawPoint[], measured: boolean): EvolutionSeries {
  const withChanges = points.map((point, index): EvolutionPoint => {
    const previous = points[index - 1];
    const change = previous ? point.value - previous.value : null;
    return {
      evaluationId: point.evaluationId,
      localDate: point.localDate,
      value: point.value,
      change,
      mdc95: measured ? point.mdc95 : null,
      significance: measured && change !== null ? significance(change, point.mdc95) : null,
    };
  });
  const first = points[0];
  const last = points.at(-1);
  const overall =
    first && last && points.length > 1
      ? {
          change: last.value - first.value,
          mdc95: measured ? last.mdc95 : null,
          significance: measured ? significance(last.value - first.value, last.mdc95) : null,
        }
      : null;
  return { points: withChanges, overall };
}

/** Agrupa los puntos por clave, en el orden en que aparece cada clave. */
function grouped<T>(
  rows: readonly (readonly [string, T, RawPoint])[],
): readonly { readonly first: T; readonly points: readonly RawPoint[] }[] {
  const groups = new Map<string, { first: T; points: RawPoint[] }>();
  for (const [key, meta, point] of rows) {
    const group = groups.get(key);
    if (group) group.points.push(point);
    else groups.set(key, { first: meta, points: [point] });
  }
  return [...groups.values()];
}

/**
 * La evolución antropométrica (RF-35): una serie por sitio medido, la suma de 6 pliegues, una por indicador y método, y una
 * por indicador y equipo de bioimpedancia. Métodos distintos nunca comparten serie (RN-D03), ni la bioimpedancia con un
 * método antropométrico (RN-C08). Las evaluaciones llegan en orden de medición.
 */
export function evolutionOf(inputs: readonly EvolutionInput[]): Evolution {
  const point = (input: EvolutionInput, value: number, mdc95: number | null): RawPoint => ({
    evaluationId: input.evaluationId,
    localDate: input.localDate,
    value,
    mdc95,
  });
  const sites = grouped(
    inputs.flatMap((input) =>
      [...input.sites].map(
        ([siteCode, value]) =>
          [siteCode, siteCode, point(input, value, input.siteMdc95.get(siteCode) ?? null)] as const,
      ),
    ),
  ).map(({ first, points }) => ({ siteCode: first, ...seriesOf(points, true) }));
  const sums = inputs.flatMap((input) =>
    input.skinfoldSum6 === null ? [] : [point(input, input.skinfoldSum6, input.skinfoldSum6Mdc95)],
  );
  const metrics = grouped(
    inputs.flatMap((input) =>
      input.metrics.map(
        (metric) =>
          [
            `${metric.metricCode}|${metric.methodCode}`,
            metric,
            point(input, metric.value, null),
          ] as const,
      ),
    ),
  ).map(({ first, points }) => ({
    metricCode: first.metricCode,
    methodCode: first.methodCode,
    unit: first.unit,
    ...seriesOf(points, false),
  }));
  const bia = grouped(
    inputs.flatMap((input) =>
      input.bia.map(
        (reading) =>
          [
            `${reading.device}|${reading.metric}`,
            reading,
            point(input, reading.value, null),
          ] as const,
      ),
    ),
  ).map(({ first, points }) => ({
    device: first.device,
    metric: first.metric,
    deviceLabel: first.deviceLabel,
    unit: first.unit,
    ...seriesOf(points, false),
  }));
  return {
    evaluations: inputs.map((input, index) => {
      const previous = inputs[index - 1];
      return {
        evaluationId: input.evaluationId,
        localDate: input.localDate,
        conditionDifferences: previous
          ? conditionDifferences(input.compared, previous.compared)
          : [],
      };
    }),
    sites,
    skinfoldSum6: sums.length === 0 ? null : seriesOf(sums, true),
    metrics,
    bia,
  };
}
