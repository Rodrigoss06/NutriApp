import { FlaskConical } from 'lucide-react';
import { cn } from '../lib/cn';

export interface MethodBadgeProps {
  /** Nombre legible del método (METHOD_LABELS de @nutricoach/contracts). */
  readonly label: string;
  /** Código del registro del motor, para el detalle. */
  readonly code?: string;
  readonly version?: string;
  readonly className?: string;
}

/**
 * Método junto a cada número (RN-D02): «% de grasa · Durnin & Womersley (1974) + Siri». Ningún número clínico
 * se muestra sin él, en pantalla ni en fichas.
 */
export function MethodBadge({ label, code, version, className }: MethodBadgeProps) {
  const detail = [code, version ? `v${version}` : null].filter(Boolean).join(' · ');
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}
      title={detail || undefined}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      <span className="sr-only">Método: </span>
      {label}
    </span>
  );
}
