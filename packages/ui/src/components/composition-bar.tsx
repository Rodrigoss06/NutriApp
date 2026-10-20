import type { CSSProperties } from 'react';
import { cn } from '../lib/cn';

export interface CompositionSegment {
  readonly key: string;
  /** Nombre del componente: «Adiposa», «Muscular»… Va siempre junto a su color. */
  readonly label: string;
  /** La masa sin redondear: solo decide el ancho del tramo. */
  readonly value: number;
  /** Un color de dato: var(--data-adipose)… */
  readonly color: string;
}

export interface CompositionBarProps {
  readonly segments: readonly CompositionSegment[];
  /** Lo que oye el lector de pantalla: qué muestra la barra y dónde están las cifras. */
  readonly label: string;
  readonly className?: string;
}

/**
 * Barra de composición: cada componente ocupa lo que pesa y crece en orden al aparecer. No muestra cifras: las
 * masas se leen abajo, cada una con su método (RN-D02); la barra solo da la proporción de un vistazo.
 */
export function CompositionBar({ segments, label, className }: CompositionBarProps) {
  const shown = segments.filter((segment) => segment.value > 0);
  if (shown.length === 0) return null;
  return (
    <figure className={cn('m-0 flex flex-col gap-2', className)}>
      <div role="img" aria-label={label} className="flex h-4 gap-0.5 overflow-hidden rounded-md">
        {shown.map((segment, k) => (
          <span
            key={segment.key}
            data-segment={segment.key}
            className="nc-grow h-full"
            style={
              {
                flexGrow: segment.value,
                flexBasis: 0,
                background: segment.color,
                '--k': k,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <figcaption>
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 font-label text-xs text-muted-foreground">
          {shown.map((segment) => (
            <li key={segment.key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: segment.color }}
              />
              {segment.label}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
