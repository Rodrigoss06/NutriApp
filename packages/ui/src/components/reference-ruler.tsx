import type { CSSProperties } from 'react';
import { cn } from '../lib/cn';

/** Tono de una banda: el de la interpretación (NEUTRAL, CAUTION, RISK), en minúsculas. */
export type RulerTone = 'neutral' | 'caution' | 'risk';

export interface RulerBand {
  /** null: sin límite inferior. Intervalo semiabierto [mínimo, máximo), como en reference_range. */
  readonly min: number | null;
  /** null: sin límite superior. */
  readonly max: number | null;
  readonly label: string;
  readonly tone: RulerTone;
}

export interface ReferenceRulerProps {
  /** El valor sin redondear: el marcador cae donde cae la interpretación (RN-D09). */
  readonly value: number;
  /** Las bandas de la tabla que interpreta el valor, de menor a mayor; vienen de la API (RN-D10). */
  readonly bands: readonly RulerBand[];
  /** Formatea los límites como el indicador (formatNumber), p. ej. «18.5». */
  readonly formatEdge?: (edge: number) => string;
  /** Orden en la entrada escalonada de la pantalla. */
  readonly index?: number;
  readonly className?: string;
}

const TONE_COLOR: Record<RulerTone, string> = {
  neutral: 'var(--brand-primary)',
  caution: 'var(--warning)',
  risk: 'var(--danger)',
};

/** Pasos posibles entre marcas: siempre «redondos», como en una cinta. */
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

/** Separación mínima entre dos límites rotulados, en % del ancho, para que no se pisen. */
const MIN_LABEL_GAP = 9;

export interface RulerLayout {
  /** Límites del dibujo: los de la tabla, con aire en los extremos abiertos, y el valor siempre dentro. */
  readonly lo: number;
  readonly hi: number;
  /** Posición del valor, de 0 a 100. */
  readonly valuePct: number;
  readonly bands: readonly (RulerBand & {
    readonly left: number;
    readonly width: number;
    readonly active: boolean;
  })[];
  /** Límites rotulados, sin los que quedarían encimados. */
  readonly edges: readonly { readonly value: number; readonly pct: number }[];
  /** Marcas a paso redondo; una de cada cinco, más larga. */
  readonly ticks: readonly { readonly pct: number; readonly major: boolean }[];
}

/** Geometría de la regla. Es solo presentación: no decide nada clínico, dibuja las bandas que llegan. */
export function rulerLayout(value: number, bands: readonly RulerBand[]): RulerLayout | null {
  const finite = [
    ...new Set(
      bands.flatMap((band) => [band.min, band.max]).filter((x): x is number => x !== null),
    ),
  ].sort((a, b) => a - b);
  const first = finite[0];
  const last = finite.at(-1);
  if (first === undefined || last === undefined) return null;
  const span = last - first || Math.abs(first) || 1;
  let lo = bands[0]?.min ?? first - span * 0.35;
  let hi = bands.at(-1)?.max ?? last + span * 0.35;
  lo = Math.min(lo, value - span * 0.05);
  hi = Math.max(hi, value + span * 0.05);
  const pct = (x: number) => ((x - lo) / (hi - lo)) * 100;

  const edges: { value: number; pct: number }[] = [];
  for (const edge of finite) {
    const at = pct(edge);
    const previous = edges.at(-1);
    if (!previous || at - previous.pct >= MIN_LABEL_GAP) edges.push({ value: edge, pct: at });
  }

  const step = STEPS.find((candidate) => (hi - lo) / candidate <= 45) ?? (hi - lo) / 40;
  const firstIndex = Math.ceil(lo / step);
  const ticks: { pct: number; major: boolean }[] = [];
  for (let i = firstIndex; i * step <= hi + step * 1e-9; i += 1) {
    ticks.push({ pct: pct(i * step), major: i % 5 === 0 });
  }

  return {
    lo,
    hi,
    valuePct: Math.min(100, Math.max(0, pct(value))),
    bands: bands.map((band) => {
      const start = pct(band.min ?? lo);
      const end = pct(band.max ?? hi);
      const active =
        (band.min === null || value >= band.min) && (band.max === null || value < band.max);
      return { ...band, left: start, width: Math.max(0, end - start), active };
    }),
    edges,
    ticks,
  };
}

/**
 * Regla de referencia: las bandas de la tabla (OMS, ACE, NICE), marcas a paso redondo y un marcador que viaja
 * hasta el valor. Es un complemento visual: el valor, su método y la interpretación con su fuente se leen aparte,
 * en texto, así que la regla queda fuera del árbol de accesibilidad. Sin bandas, no se dibuja.
 */
export function ReferenceRuler({
  value,
  bands,
  formatEdge = String,
  index = 0,
  className,
}: ReferenceRulerProps) {
  const layout = rulerLayout(value, bands);
  if (!layout) return null;
  return (
    <div aria-hidden data-ruler className={cn('flex flex-col gap-1', className)}>
      <div className="relative h-7 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-2 rounded-full bg-surface">
          {layout.bands.map((band) => (
            <span
              key={`${String(band.min)}-${String(band.max)}`}
              data-active={band.active || undefined}
              className="absolute inset-y-0 border-x border-card first:rounded-l-full last:rounded-r-full"
              style={{
                left: `${String(band.left)}%`,
                width: `${String(band.width)}%`,
                background: `color-mix(in oklab, ${TONE_COLOR[band.tone]} ${band.active ? '72%' : '30%'}, var(--card))`,
              }}
            />
          ))}
        </div>
        <span
          data-ruler-marker
          className="nc-to-value absolute inset-y-0 left-0 w-full"
          style={
            { transform: `translateX(${String(layout.valuePct)}%)`, '--i': index } as CSSProperties
          }
        >
          <span className="absolute top-0 -left-1.5 border-x-[6px] border-t-8 border-x-transparent border-t-signal" />
          <span className="absolute top-2 bottom-0 -left-px w-0.5 rounded-full bg-foreground" />
        </span>
      </div>
      <div className="relative h-2">
        {layout.ticks.map((tick) => (
          <span
            key={tick.pct}
            className={cn(
              'absolute top-0 w-px bg-foreground',
              tick.major ? 'h-2 opacity-60' : 'h-1 opacity-35',
            )}
            style={{ left: `${String(tick.pct)}%` }}
          />
        ))}
      </div>
      <div className="relative h-4 font-label text-[11px] text-muted-foreground tabular-nums">
        {layout.edges.map((edge, i) => (
          <span
            key={edge.value}
            className="absolute whitespace-nowrap"
            style={{
              left: `${String(edge.pct)}%`,
              transform:
                edge.pct < 4 && i === 0
                  ? 'none'
                  : edge.pct > 96
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {formatEdge(edge.value)}
          </span>
        ))}
      </div>
    </div>
  );
}
