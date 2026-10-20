import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface IndicatorCardProps {
  readonly label: string;
  /** Ya formateado con formatNumber (RN-D09). */
  readonly value: string;
  readonly unit?: string;
  /** MethodBadge del número (RN-D02). */
  readonly method?: ReactNode;
  /** StatusBadge: en rango, fuera de rango, sin cambio significativo... */
  readonly status?: ReactNode;
  /** ReferenceRuler: dónde cae el valor en su tabla de referencia. */
  readonly scale?: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Tarjeta de un indicador: nombre, valor con unidad, su regla de referencia, estado y método. */
export function IndicatorCard({
  label,
  value,
  unit,
  method,
  status,
  scale,
  footer,
  className,
  style,
}: IndicatorCardProps) {
  return (
    <section
      style={style}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4 text-foreground shadow-card',
        className,
      )}
    >
      <h3 className="font-label text-sm font-medium text-muted-foreground">{label}</h3>
      <p className="flex items-baseline gap-1.5">
        <span className="text-4xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </p>
      {scale}
      {status}
      {method}
      {footer ? <div className="border-t border-border pt-2 text-sm">{footer}</div> : null}
    </section>
  );
}
