'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TargetVsActualPoint {
  /** Etiqueta del eje, ya formateada (día o semana). */
  readonly label: string;
  readonly target: number | null;
  readonly actual: number | null;
}

export interface TargetVsActualChartProps {
  readonly title: string;
  readonly points: readonly TargetVsActualPoint[];
  /** Formatea cada valor para la tabla y la ayuda (formatNumber). */
  readonly format: (value: number | null) => string;
  readonly unit: string;
}

/**
 * Meta contra real (RF-32). Se importa desde `@nutricoach/ui/chart`, aparte del resto, para que Recharts no
 * pese en pantallas sin gráficos. Las mismas cifras van en una tabla para lectores de pantalla. La meta se
 * dibuja punteada: se distingue sin depender del color.
 */
export function TargetVsActualChart({ title, points, format, unit }: TargetVsActualChartProps) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div aria-hidden className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={[...points]}
            margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            // La tabla de abajo es la versión accesible: el dibujo queda fuera del foco y del lector.
            accessibilityLayer={false}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
            <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} width={48} />
            <Tooltip
              formatter={(value) => `${format(typeof value === 'number' ? value : null)} ${unit}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="target"
              name="Meta"
              stroke="var(--brand-secondary-border)"
              strokeDasharray="6 4"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Real"
              stroke="var(--brand-primary-border)"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Meta ({unit})</th>
            <th scope="col">Real ({unit})</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{format(point.target)}</td>
              <td>{format(point.actual)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
