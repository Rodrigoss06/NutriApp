import {
  CONDITION_DIFFERENCE_LABELS,
  formatReading,
  KIND_LABELS,
  LEVEL_LABELS,
  methodLabel,
  METRIC_NUMBER_KINDS,
  METRIC_UNIT_LABELS,
  SIGNIFICANCE_LABELS,
  SITE_NUMBER_KINDS,
  type DietTrend,
  type EvolutionResponse,
  type MemberResponse,
  type NumberKind,
} from '@nutricoach/contracts';
import { formatNumber, MethodBadge, StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatTable } from '@/features/analytics/stat-table';
import { Section } from '@/features/patients/section';
import { formatDate } from '@/lib/dates';
import { EvolutionChart } from './evolution-chart';
import { metricName, seriesOptions, trendRows } from './evolution-view';
import { SIGNIFICANCE_TONES } from './labels';

type Series = {
  readonly points: EvolutionResponse['sites'][number]['points'];
  readonly overall: EvolutionResponse['sites'][number]['overall'];
};

const lookup = <T,>(labels: Readonly<Record<string, T>>, code: string): T | undefined =>
  (labels as Readonly<Record<string, T | undefined>>)[code];

/** «−6.9 mm»: el cambio con su signo, su redondeo (RN-D09) y su unidad. */
const signed = (change: number, text: (value: number) => string) =>
  change > 0 ? `+${text(change)}` : change < 0 ? `−${text(-change)}` : text(0);

const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLabel = (month: string) => MONTH.format(new Date(`${month}-15T12:00:00Z`));

interface Row {
  readonly key: string;
  readonly name: string;
  readonly series: Series;
  readonly text: (value: number) => string;
  /** La unidad de la medida, para su CMD95. */
  readonly unit?: string;
}

const first = (row: Row) => row.series.points[0];
const last = (row: Row) => row.series.points.at(-1);
const valueAt = (row: Row, point: Row['series']['points'][number] | undefined) =>
  point ? `${row.text(point.value)} · ${formatDate(point.localDate)}` : '—';

function SignificanceBadge({ series }: { series: Series }) {
  const significance = series.overall?.significance;
  if (!significance) return <span className="text-muted-foreground">—</span>;
  return (
    <StatusBadge tone={SIGNIFICANCE_TONES[significance]}>
      {SIGNIFICANCE_LABELS[significance]}
    </StatusBadge>
  );
}

/** RN-C06: cada medida con su primer y último valor y su cambio frente al CMD95 del evaluador del último punto. */
function MeasurementsTable({ evolution }: { evolution: EvolutionResponse }) {
  const siteText = (unit: 'kg' | 'cm' | 'mm') => (value: number) =>
    `${formatNumber(value, SITE_NUMBER_KINDS[unit])} ${unit}`;
  const rows: Row[] = [
    ...(evolution.skinfoldSum6 && evolution.skinfoldSum6.points.length > 1
      ? [
          {
            key: 'SUM6',
            name: 'Suma de 6 pliegues',
            series: evolution.skinfoldSum6,
            text: siteText('mm'),
            unit: 'mm',
          },
        ]
      : []),
    ...evolution.sites
      .filter((site) => site.points.length > 1)
      .map((site) => ({
        key: site.siteCode,
        name: site.name,
        series: site,
        text: siteText(site.unit),
        unit: site.unit,
      })),
  ];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Ninguna medida se tomó en dos evaluaciones.</p>
    );
  }
  return (
    <StatTable
      label="Medidas en el tiempo"
      caption="Cada medida con su primer y último valor, su cambio y si supera el CMD95 del evaluador"
      rows={rows}
      rowKey={(row) => row.key}
      columns={[
        { key: 'name', header: 'Medida', cell: (row) => row.name },
        { key: 'first', header: 'Primera', numeric: true, cell: (row) => valueAt(row, first(row)) },
        { key: 'last', header: 'Última', numeric: true, cell: (row) => valueAt(row, last(row)) },
        {
          key: 'change',
          header: 'Cambio',
          numeric: true,
          cell: (row) => (row.series.overall ? signed(row.series.overall.change, row.text) : '—'),
        },
        {
          key: 'mdc95',
          header: 'CMD95',
          numeric: true,
          cell: (row) => {
            const minimal = row.series.overall?.mdc95;
            return minimal === null || minimal === undefined
              ? '—'
              : `${formatNumber(minimal, 'measurementError')} ${row.unit ?? ''}`;
          },
        },
        {
          key: 'significance',
          header: 'Frente al CMD95',
          cell: (row) => <SignificanceBadge series={row.series} />,
        },
      ]}
    />
  );
}

/** RN-D03 · RN-C05: cada indicador por método, con su cambio; el CMD95 no se traslada a los números derivados. */
function MetricsTable({ evolution }: { evolution: EvolutionResponse }) {
  const rows: Row[] = evolution.metrics
    .filter((metric) => metric.points.length > 1)
    .map((metric) => {
      const kind: NumberKind = lookup(METRIC_NUMBER_KINDS, metric.metricCode) ?? 'index';
      const unit = lookup(METRIC_UNIT_LABELS, metric.unit) ?? metric.unit;
      return {
        key: `${metric.metricCode}:${metric.methodCode}`,
        name: metricName(metric.metricCode, metric.methodCode),
        series: metric,
        text: (value: number) =>
          unit ? `${formatNumber(value, kind)} ${unit}` : formatNumber(value, kind),
      };
    });
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay indicadores calculados en dos evaluaciones.
      </p>
    );
  }
  return (
    <StatTable
      label="Indicadores en el tiempo"
      caption="Cada indicador con su método, su primer y último valor y su cambio"
      rows={rows}
      rowKey={(row) => row.key}
      columns={[
        { key: 'name', header: 'Indicador y método', cell: (row) => row.name },
        { key: 'first', header: 'Primera', numeric: true, cell: (row) => valueAt(row, first(row)) },
        { key: 'last', header: 'Última', numeric: true, cell: (row) => valueAt(row, last(row)) },
        {
          key: 'change',
          header: 'Cambio',
          numeric: true,
          cell: (row) => (row.series.overall ? signed(row.series.overall.change, row.text) : '—'),
        },
      ]}
    />
  );
}

/** RN-C08: la bioimpedancia por equipo, como lectura cargada a mano; nunca en la misma serie que la antropometría. */
function BiaTable({ evolution }: { evolution: EvolutionResponse }) {
  const rows: Row[] = evolution.bia
    .filter((reading) => reading.points.length > 1)
    .map((reading) => ({
      key: `${reading.device}:${reading.metric}`,
      name: `${reading.deviceLabel} · ${reading.device}`,
      series: reading,
      text: (value: number) => formatReading(value, reading.unit),
    }));
  if (rows.length === 0) return null;
  return (
    <StatTable
      label="Bioimpedancia en el tiempo"
      caption="Cada lectura de bioimpedancia por equipo, con su primer y último valor y su cambio"
      rows={rows}
      rowKey={(row) => row.key}
      columns={[
        { key: 'name', header: 'Lectura y equipo', cell: (row) => row.name },
        { key: 'first', header: 'Primera', numeric: true, cell: (row) => valueAt(row, first(row)) },
        { key: 'last', header: 'Última', numeric: true, cell: (row) => valueAt(row, last(row)) },
        {
          key: 'change',
          header: 'Cambio',
          numeric: true,
          cell: (row) => (row.series.overall ? signed(row.series.overall.change, row.text) : '—'),
        },
      ]}
    />
  );
}

/** RN-G09: la tendencia de cada mes, junto a las evaluaciones de ese mes. */
function TrendTable({ trend, evolution }: { trend: DietTrend; evolution: EvolutionResponse }) {
  const pct = (value: number | null) =>
    value === null ? '—' : `${formatNumber(value, 'percent')} %`;
  const rows = trendRows(trend.months, evolution.evaluations);
  return (
    <StatTable
      label="Tendencia de cada mes"
      caption="Por mes: las evaluaciones, la energía promedio contra la meta, los días en rango y las sesiones"
      rows={rows}
      rowKey={(row) => row.month}
      columns={[
        { key: 'month', header: 'Mes', cell: (row) => monthLabel(row.month) },
        {
          key: 'evaluations',
          header: 'Evaluaciones',
          cell: (row) => row.evaluations.map((date) => formatDate(date)).join(', ') || '—',
        },
        {
          key: 'kcal',
          header: 'Energía promedio',
          numeric: true,
          cell: ({ trend: month }) =>
            !month || month.kcal.consumed === null
              ? '—'
              : `${month.kcal.complete ? '' : 'al menos '}${formatNumber(month.kcal.consumed, 'kcal')} / ${formatNumber(month.kcal.target, 'kcal')} kcal`,
        },
        {
          key: 'adequacy',
          header: 'Adecuación',
          numeric: true,
          cell: ({ trend: month }) => pct(month?.kcal.adequacyPct ?? null),
        },
        {
          key: 'inRange',
          header: 'Días en rango',
          numeric: true,
          cell: ({ trend: month }) =>
            month ? `${String(month.daysInRange)} de ${String(month.daysWithTarget)}` : '—',
        },
        {
          key: 'sessions',
          header: 'Sesiones',
          numeric: true,
          cell: ({ trend: month }) => {
            if (!month) return '—';
            return month.sessionsPlanned === null
              ? `${String(month.sessionsDone)} registradas`
              : `${String(month.sessionsDone)} de ${String(month.sessionsPlanned)}`;
          },
        },
      ]}
    />
  );
}

/** Las evaluaciones en orden, con lo que cambió frente a la anterior (RN-C09). */
function EvaluationsList({
  evolution,
  members,
  base,
}: {
  evolution: EvolutionResponse;
  members: readonly MemberResponse[];
  base: string;
}) {
  const name = (memberId: string) =>
    members.find((member) => member.id === memberId)?.displayName ?? 'El equipo';
  return (
    <ol className="flex flex-col gap-2">
      {evolution.evaluations.map((evaluation, index) => (
        <li
          key={evaluation.evaluationId}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2"
        >
          <Link
            href={`${base}/${evaluation.evaluationId}`}
            className="font-medium text-brand-text underline"
          >
            {formatDate(evaluation.localDate)}
          </Link>
          <span className="text-sm text-muted-foreground">
            {evaluation.level ? LEVEL_LABELS[evaluation.level] : KIND_LABELS[evaluation.kind]} ·{' '}
            {name(evaluation.evaluatorMemberId)}
          </span>
          {index > 0 && evaluation.conditionDifferences.length > 0 ? (
            <StatusBadge tone="warning">
              Frente a la anterior:{' '}
              {evaluation.conditionDifferences
                .map((code) => CONDITION_DIFFERENCE_LABELS[code])
                .join(', ')}
            </StatusBadge>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * La evolución antropométrica para el equipo (RF-35): el cambio real frente al ruido (RN-C06), los métodos sin compararse
 * entre sí (RN-D03), la bioimpedancia aparte (RN-C08), la tendencia por mes (RN-G09) y la ficha de evolución (RN-H01).
 */
export function EvolutionBoard({
  evolution,
  trend,
  members,
  patientId,
  download,
}: {
  evolution: EvolutionResponse;
  trend: DietTrend | null;
  members: readonly MemberResponse[];
  patientId: string;
  download: ReactNode;
}) {
  const base = `/panel/pacientes/${patientId}/evaluaciones`;
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Evaluaciones"
        description="Las evaluaciones cerradas vigentes, en orden. Si cambian el evaluador o las condiciones, el cambio puede deberse a eso y no al cuerpo (RN-C09)."
      >
        <EvaluationsList evolution={evolution} members={members} base={base} />
        {download}
      </Section>
      <Section
        title="Medidas"
        description="Valores consolidados de las tomas. Un cambio que no supera el CMD95 del evaluador es «sin cambio significativo» (RN-C06)."
      >
        <MeasurementsTable evolution={evolution} />
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <MethodBadge label={methodLabel('CONSOLIDATE_ISAK')} code="CONSOLIDATE_ISAK" />
          <MethodBadge label={methodLabel('MDC95')} code="MDC95" />
        </p>
      </Section>
      <Section
        title="Indicadores por método"
        description="Cada serie es de un solo método: los métodos no se comparan entre sí (RN-D03). A los números derivados no se les aplica el CMD95 (RN-C05)."
      >
        <MetricsTable evolution={evolution} />
        <BiaTable evolution={evolution} />
      </Section>
      <Section
        title="En el tiempo"
        description="Elige una serie para verla evaluación por evaluación."
      >
        <EvolutionChart options={seriesOptions(evolution)} />
      </Section>
      {trend ? (
        <Section
          title="Mes a mes"
          description="La tendencia de lo que registró el paciente cada mes, para leerla junto a la evolución (RN-G09)."
        >
          <TrendTable trend={trend} evolution={evolution} />
          <MethodBadge
            label={methodLabel(trend.method.code)}
            code={trend.method.code}
            version={trend.method.version}
          />
        </Section>
      ) : null}
    </div>
  );
}
