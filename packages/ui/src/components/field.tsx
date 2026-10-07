import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-input-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground disabled:opacity-50 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export interface FieldMessagesProps {
  readonly id: string;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
}

/** Ayuda y error ligados al campo por aria-describedby; el error se anuncia. */
export function FieldMessages({ id, hint, error }: FieldMessagesProps) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function describedBy(id: string, hint?: ReactNode, error?: ReactNode): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}
