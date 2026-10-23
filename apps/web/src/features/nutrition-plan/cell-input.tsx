'use client';

import { cn, Input } from '@nutricoach/ui';
import { useId, type ComponentProps } from 'react';

/**
 * Un campo dentro de una tabla: la cabecera lo nombra a la vista y aria-label lo nombra completo («Verduras:
 * intercambios por día»). El error queda enlazado y se anuncia.
 */
export function CellInput({
  label,
  error,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'id' | 'aria-label'> & { label: string; error?: string }) {
  const id = useId();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Input
        id={id}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete="off"
        className={cn('w-20 text-right tabular-nums', className)}
        {...props}
      />
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
