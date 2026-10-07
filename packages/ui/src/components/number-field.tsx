'use client';

import { useId, useState, type ReactNode } from 'react';
import { parseDecimal } from '../format/format-number';
import { cn } from '../lib/cn';
import { describedBy, FieldMessages, Input, Label } from './field';

export type MeasureUnit = 'kg' | 'cm' | 'mm' | 'kcal' | 'g' | 'ml' | '%';

export interface NumberFieldProps {
  readonly label: ReactNode;
  readonly unit: MeasureUnit;
  readonly value: number | null;
  readonly onValueChange: (value: number | null) => void;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly name?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * Campo numérico con unidad (RF-11): type="text" con inputMode="decimal" abre el teclado numérico en el celular
 * y acepta coma o punto. Guarda lo que se escribe tal cual y entrega el número o null; nunca redondea.
 */
export function NumberField({
  label,
  unit,
  value,
  onValueChange,
  hint,
  error,
  name,
  required,
  disabled,
  className,
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const unitId = `${id}-unit`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required={required}
          disabled={disabled}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={[unitId, describedBy(id, hint, error)].filter(Boolean).join(' ')}
          className="pr-14 text-right tabular-nums"
          onChange={(event) => {
            setText(event.target.value);
            onValueChange(parseDecimal(event.target.value));
          }}
        />
        <span
          id={unitId}
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
        >
          {unit}
        </span>
      </div>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}
