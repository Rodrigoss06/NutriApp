import type { ReactNode } from 'react';
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
  readonly footer?: ReactNode;
  readonly className?: string;
}

/** Tarjeta de un indicador: nombre, valor con unidad, método y estado. */
export function IndicatorCard({
  label,
  value,
  unit,
  method,
  status,
  footer,
  className,
}: IndicatorCardProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-background p-4',
        className,
      )}
    >
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <p className="flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </p>
      {method}
      {status}
      {footer ? <div className="border-t border-border pt-2 text-sm">{footer}</div> : null}
    </section>
  );
}
