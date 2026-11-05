'use client';

import { cn } from '@nutricoach/ui';
import { useId, type ReactNode } from 'react';

/**
 * Una escala de un toque (07 §9): de `min` a `max`, cada valor un botón de 44 px (06 §8) hecho con radios nativos, así se
 * recorre con el teclado y el lector la anuncia como grupo. Opcional: sin tocar queda sin dato, que no es cero.
 */
export function ScaleField({
  label,
  hint,
  min,
  max,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: ReactNode;
  min: number;
  max: number;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={hint ? hintId : undefined}>
      <legend className="text-sm font-medium">{label}</legend>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="flex gap-1.5">
        {options.map((option) => (
          <label key={option} className="flex-1">
            <input
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              disabled={disabled}
              onChange={() => {
                onChange(option);
              }}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-touch cursor-pointer items-center justify-center rounded-md border border-brand-border bg-card font-medium text-brand-text tabular-nums transition-colors',
                'peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-border',
                'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
              )}
            >
              {option}
            </span>
          </label>
        ))}
      </div>
      {value !== null && !disabled ? (
        <button
          type="button"
          aria-label={`Quitar la respuesta de ${label.toLowerCase()}`}
          className="flex min-h-touch items-center self-start text-sm text-brand-text underline"
          onClick={() => {
            onChange(null);
          }}
        >
          Quitar
        </button>
      ) : null}
    </fieldset>
  );
}
