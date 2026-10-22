import { cn } from '@nutricoach/ui';
import type { ReactNode } from 'react';

/**
 * Contenedor de una tabla que puede ser más ancha que la pantalla: en el celular se desplaza, y también con el teclado
 * (WCAG 2.1.1; axe: scrollable-region-focusable). Por eso es una región con nombre y se puede enfocar. Es relative:
 * un texto sr-only de una columna fuera de la pantalla queda dentro del desplazamiento y no ensancha la página.
 */
export function TableScroll({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        'relative overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        className,
      )}
    >
      {children}
    </div>
  );
}
