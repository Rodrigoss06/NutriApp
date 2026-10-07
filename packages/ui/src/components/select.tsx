'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { describedBy, FieldMessages, Label } from './field';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly label: ReactNode;
  readonly options: readonly SelectOption[];
  readonly value?: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Lista desplegable accesible (Radix): teclado, lector de pantalla y portal con la marca de :root. */
export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder = 'Elige una opción',
  hint,
  error,
  disabled,
  className,
}: SelectProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectPrimitive.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input-border bg-background px-3 text-left text-base data-placeholder:text-muted-foreground"
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-background shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex min-h-touch cursor-default items-center rounded-sm py-2 pr-8 pl-3 text-base outline-none select-none data-highlighted:bg-muted"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex">
                    <Check aria-hidden className="size-4 text-brand-text" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}
