'use client';

import type { ReactNode } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

/** Formatea cada valor para la tabla y la ayuda (formatNumber); sin valor, una raya. */
export type ChartFormat = (value: number | null) => string;

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const;
const MARGIN = { top: 8, right: 8, bottom: 8, left: 0 } as const;
const PRIMARY = 'var(--brand-primary-border)';
const REFERENCE = 'var(--brand-secondary-border)';
/** El texto de la leyenda va en tinta neutra: el color lo lleva la clave de al lado, nunca el texto. */
const legendText = (value: unknown) => (
  <span className="text-muted-foreground">{String(value)}</span>
);
/** El punto lleva un anillo del color de la tarjeta: se lee aunque cruce la línea de referencia. */
const DOT = { r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: PRIMARY } as const;

/**
 * La ayuda al pasar el puntero: el valor primero y la serie después, con su trazo como clave. Ayuda, nunca es el
 * único camino: las mismas cifras están en la tabla del gráfico.
 */
function tooltipFor(format: ChartFormat, unit: string) {
  return function ChartTooltip({ active, payload, label }: TooltipContentProps) {
    if (!active || payload.length === 0) return null;
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-card">
        <p className="text-xs text-muted-foreground">{label}</p>
        <ul className="flex flex-col gap-0.5">
          {payload.map((entry) => (
            <li key={String(entry.dataKey)} className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: entry.color }} />
              <span className="font-semibold tabular-nums">
                {format(typeof entry.value === 'number' ? entry.value : null)} {unit}
              </span>
              <span className="text-muted-foreground">{entry.name}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };
}

/**
 * La versión accesible de cada gráfico: el dibujo queda fuera del foco y del lector, y esta tabla lo reemplaza. Va dentro de
 * un div sr-only: una tabla no se achica a 1 px como un bloque, y suelta ensancharía la página en el celular.
 */
function ChartTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: readonly string[];
  rows: readonly { readonly label: string; readonly cells: readonly string[] }[];
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, index) => (
                <td key={headers[index + 1] ?? index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartFrame({
  title,
  description,
  children,
  table,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  table: ReactNode;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </figcaption>
      <div aria-hidden className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
      {table}
    </figure>
  );
}

export interface TargetVsActualPoint {
  /** Etiqueta del eje, ya formateada (día o semana). */
  readonly label: string;
  readonly target: number | null;
  readonly actual: number | null;
}

export interface TargetVsActualChartProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly points: readonly TargetVsActualPoint[];
  readonly format: ChartFormat;
  readonly unit: string;
  /** Encabezado de la primera columna de la tabla accesible. */
  readonly categoryName?: string;
}

/**
 * Meta contra real (RF-32). Se importa desde `@nutricoach/ui/chart`, aparte del resto, para que Recharts no
 * pese en pantallas sin gráficos. Las mismas cifras van en una tabla para lectores de pantalla. La meta se
 * dibuja punteada: se distingue sin depender del color. Un día sin registro corta la línea: no es cero.
 */
export function TargetVsActualChart({
  title,
  description,
  points,
  format,
  unit,
  categoryName = 'Fecha',
}: TargetVsActualChartProps) {
  return (
    <ChartFrame
      title={title}
      description={description}
      table={
        <ChartTable
          title={title}
          headers={[categoryName, `Meta (${unit})`, `Real (${unit})`]}
          rows={points.map((point) => ({
            label: point.label,
            cells: [format(point.target), format(point.actual)],
          }))}
        />
      }
    >
      <LineChart data={[...points]} margin={MARGIN} accessibilityLayer={false}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} interval="equidistantPreserveEnd" />
        <YAxis tick={AXIS_TICK} width={48} />
        <Tooltip content={tooltipFor(format, unit)} />
        <Legend formatter={legendText} />
        <Line
          type="monotone"
          dataKey="target"
          name="Meta"
          stroke={REFERENCE}
          strokeDasharray="6 4"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="Real"
          stroke={PRIMARY}
          strokeWidth={2}
          dot={DOT}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

export interface ColumnPoint {
  readonly label: string;
  readonly value: number | null;
  /** Lo programado, si el gráfico lo compara: se dibuja como línea punteada. */
  readonly reference?: number | null;
}

export interface ColumnChartProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly points: readonly ColumnPoint[];
  readonly format: ChartFormat;
  readonly unit: string;
  /** El nombre de las columnas: «Hecho», «Carga sRPE». */
  readonly valueName: string;
  /** El nombre de la referencia, si la hay: «Programado». */
  readonly referenceName?: string;
  readonly categoryName: string;
}

/**
 * Una magnitud por semana (RF-33): columnas finas de un solo color, que crecen desde la base, y, si se compara, lo
 * programado como línea punteada. Sin segundo eje: dos magnitudes distintas van en dos gráficos.
 */
export function ColumnChart({
  title,
  description,
  points,
  format,
  unit,
  valueName,
  referenceName,
  categoryName,
}: ColumnChartProps) {
  const withReference = referenceName !== undefined;
  return (
    <ChartFrame
      title={title}
      description={description}
      table={
        <ChartTable
          title={title}
          headers={[
            categoryName,
            `${valueName} (${unit})`,
            ...(withReference ? [`${referenceName} (${unit})`] : []),
          ]}
          rows={points.map((point) => ({
            label: point.label,
            cells: [
              format(point.value),
              ...(withReference ? [format(point.reference ?? null)] : []),
            ],
          }))}
        />
      }
    >
      <ComposedChart data={[...points]} margin={MARGIN} accessibilityLayer={false}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} width={56} />
        <Tooltip content={tooltipFor(format, unit)} cursor={{ fill: 'var(--surface)' }} />
        {withReference ? <Legend formatter={legendText} /> : null}
        <Bar
          dataKey="value"
          name={valueName}
          fill={PRIMARY}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        {withReference ? (
          <Line
            type="monotone"
            dataKey="reference"
            name={referenceName}
            stroke={REFERENCE}
            strokeDasharray="6 4"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ) : null}
      </ComposedChart>
    </ChartFrame>
  );
}

export interface TrendPoint {
  readonly label: string;
  readonly value: number | null;
}

export interface TrendChartProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly points: readonly TrendPoint[];
  readonly format: ChartFormat;
  readonly unit: string;
  readonly seriesName: string;
  readonly categoryName: string;
}

/** Una serie en el tiempo (el 1RM estimado, RN-F04): línea de 2 px con sus puntos; el título dice qué se dibuja. */
export function TrendChart({
  title,
  description,
  points,
  format,
  unit,
  seriesName,
  categoryName,
}: TrendChartProps) {
  return (
    <ChartFrame
      title={title}
      description={description}
      table={
        <ChartTable
          title={title}
          headers={[categoryName, `${seriesName} (${unit})`]}
          rows={points.map((point) => ({ label: point.label, cells: [format(point.value)] }))}
        />
      }
    >
      <LineChart data={[...points]} margin={MARGIN} accessibilityLayer={false}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} interval="equidistantPreserveEnd" />
        <YAxis tick={AXIS_TICK} width={48} domain={['auto', 'auto']} />
        <Tooltip content={tooltipFor(format, unit)} />
        <Line
          type="monotone"
          dataKey="value"
          name={seriesName}
          stroke={PRIMARY}
          strokeWidth={2}
          dot={DOT}
          activeDot={{ ...DOT, r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}
