import {
  methodLabel,
  METRIC_LABELS,
  type EvaluationComparisonResponse,
  type MeasurementSite,
} from '@nutricoach/contracts';
import {
  EmptyState,
  formatNumber,
  MethodBadge,
  Notice,
  StatusBadge,
  type NumberKind,
} from '@nutricoach/ui';
import { GitCompareArrows } from 'lucide-react';
import { formatInstant } from '@/lib/dates';
import {
  CONDITION_DIFFERENCE_LABELS,
  METRIC_NUMBER_KINDS,
  METRIC_UNIT_LABELS,
  SIGNIFICANCE_LABELS,
  SIGNIFICANCE_TONES,
  SITE_NUMBER_KINDS,
} from './labels';
import { TableScroll } from '@/features/shell/table-scroll';

/** Un cambio con su signo: «+0.4» o «-6.9». */
const signed = (value: number, kind: NumberKind) =>
  `${value > 0 ? '+' : ''}${formatNumber(value, kind)}`;

/**
 * Comparación con otra evaluación (RF-15, RN-C06): cada sitio frente al CMD95 del evaluador, la suma de 6 pliegues con
 * el %ETM agrupado (G-04) y los resultados de un método solo contra ese mismo método (RN-D03). Si cambian las
 * condiciones o el evaluador, se advierte (RN-C09).
 */
export function ComparisonView({
  comparison,
  sites,
  timezone,
}: {
  comparison: EvaluationComparisonResponse;
  sites: readonly MeasurementSite[];
  timezone: string;
}) {
  const { previous, current } = comparison;
  if (!previous) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="No hay una evaluación anterior para comparar"
        description="Se compara con la evaluación cerrada anterior que tenga antropometría; una solo de bioimpedancia no comparte serie (RN-C08)."
      />
    );
  }
  const site = (code: string) => sites.find((s) => s.code === code);
  const byMethod = new Map<string, EvaluationComparisonResponse['metrics']>();
  for (const metric of comparison.metrics) {
    byMethod.set(metric.methodCode, [...(byMethod.get(metric.methodCode) ?? []), metric]);
  }
  const sum = comparison.skinfoldSum6;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Anterior: {formatInstant(previous.measuredAt, timezone)} · Actual:{' '}
        {formatInstant(current.measuredAt, timezone)}. Cambio = actual − anterior.
      </p>
      {comparison.conditionDifferences.length > 0 ? (
        <Notice
          tone="warning"
          title="Las condiciones de las dos evaluaciones difieren"
          rule="RN-C09"
        >
          {comparison.conditionDifferences
            .map((difference) => CONDITION_DIFFERENCE_LABELS[difference])
            .join(', ')}
          . Los cambios pueden deberse a eso y no al cuerpo.
        </Notice>
      ) : (
        <Notice tone="info" title="Mismas condiciones y mismo evaluador" rule="RN-C09" />
      )}

      {sum ? (
        <section
          aria-labelledby="suma-6"
          className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card"
        >
          <h3 id="suma-6" className="font-semibold">
            Suma de 6 pliegues
          </h3>
          <p className="tabular-nums">
            De {formatNumber(sum.previous, 'length')} a {formatNumber(sum.current, 'length')} mm:{' '}
            <span className="font-semibold">{signed(sum.delta, 'length')} mm</span>
            {sum.mdc95 === null ? null : (
              <>
                {' '}
                frente a un CMD95 de{' '}
                <span className="font-semibold">
                  {formatNumber(sum.mdc95, 'measurementError')} mm
                </span>
                {sum.temRelPct === null
                  ? null
                  : ` (%ETM agrupado ${formatNumber(sum.temRelPct, 'measurementError')} %)`}
              </>
            )}
          </p>
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={SIGNIFICANCE_TONES[sum.significance]}>
              {SIGNIFICANCE_LABELS[sum.significance]}
            </StatusBadge>
            <MethodBadge label={methodLabel('MDC95')} code="MDC95" />
          </span>
        </section>
      ) : null}

      <section aria-labelledby="sitios-comparados" className="flex flex-col gap-2">
        <h3 id="sitios-comparados" className="font-semibold">
          Sitios
        </h3>
        <TableScroll label="Cambio de cada sitio">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Cambio de cada sitio frente al CMD95</caption>
            <thead className="bg-surface text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Sitio
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Anterior
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Actual
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Cambio
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  CMD95
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  ¿Real?
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.sites.map((row) => {
                const catalog = site(row.siteCode);
                const kind = catalog ? SITE_NUMBER_KINDS[catalog.unit] : 'length';
                return (
                  <tr key={row.siteCode} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {catalog?.nameEs ?? row.siteCode}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.previous, kind)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.current, kind)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {signed(row.delta, kind)} {row.unit}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.mdc95 === null
                        ? '—'
                        : `${formatNumber(row.mdc95, 'measurementError')} ${row.unit}`}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={SIGNIFICANCE_TONES[row.significance]}>
                        {SIGNIFICANCE_LABELS[row.significance]}
                      </StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        <p className="text-xs text-muted-foreground">
          Un cambio menor que el CMD95 de quien evaluó no se distingue del error de medición
          (RN-C06). El CMD95 no se traslada al % de grasa.
        </p>
      </section>

      {byMethod.size > 0 ? (
        <section aria-labelledby="metodos-comparados" className="flex flex-col gap-3">
          <h3 id="metodos-comparados" className="font-semibold">
            Resultados por método
          </h3>
          <p className="text-sm text-muted-foreground">
            Cada método se compara solo consigo mismo (RN-D03).
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {[...byMethod.entries()].map(([methodCode, metrics]) => (
              <article
                key={methodCode}
                aria-label={methodLabel(methodCode)}
                className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card"
              >
                <MethodBadge
                  label={methodLabel(methodCode)}
                  code={methodCode}
                  className="text-sm"
                />
                <dl className="flex flex-col divide-y divide-border">
                  {metrics.map((metric) => {
                    const kind = METRIC_NUMBER_KINDS[metric.metricCode];
                    const unit = METRIC_UNIT_LABELS[metric.unit];
                    return (
                      <div
                        key={metric.metricCode}
                        className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                      >
                        <dt className="text-muted-foreground">
                          {METRIC_LABELS[metric.metricCode]}
                        </dt>
                        <dd className="tabular-nums">
                          de {formatNumber(metric.previous, kind)} a{' '}
                          {formatNumber(metric.current, kind)}
                          {unit ? ` ${unit}` : ''} ({signed(metric.delta, kind)})
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
