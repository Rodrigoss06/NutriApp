import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Brilla al pasar el puntero o al enfocarlo (nc-shine); con `attention`, también una vez al aparecer. */
        primary: 'nc-shine bg-brand text-brand-foreground shadow-card hover:bg-brand/90',
        secondary: 'border border-brand-border bg-card text-brand-text hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        /** 44 px: la app del paciente (06 §8). */
        touch: 'min-h-touch px-5 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Renderiza el hijo (un enlace, por ejemplo) con el estilo del botón. */
  readonly asChild?: boolean;
  /** La acción principal de la pantalla: un brillo al aparecer (solo en el botón primario). */
  readonly attention?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  attention = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      className={cn(
        buttonVariants({ variant, size }),
        attention && (variant ?? 'primary') === 'primary' && 'nc-shine-once',
        className,
      )}
      {...(asChild ? {} : { type })}
      {...props}
    />
  );
}
