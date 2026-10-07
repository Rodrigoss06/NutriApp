import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export interface Step {
  readonly id: string;
  readonly label: string;
}

export interface StepsProps {
  readonly steps: readonly Step[];
  readonly currentId: string;
  readonly label?: string;
  readonly className?: string;
}

/** Pasos de un asistente (crear evaluación, prescribir): el actual con aria-current="step". */
export function Steps({ steps, currentId, label = 'Pasos', className }: StepsProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentId),
  );
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li
              key={step.id}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-sm',
                current && 'border-brand-border bg-brand text-brand-foreground',
                done && 'border-brand-border text-brand-text',
                !current && !done && 'border-border text-muted-foreground',
              )}
            >
              <span
                aria-hidden
                className="flex size-5 items-center justify-center rounded-full text-xs"
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              {step.label}
              {done ? <span className="sr-only">(completado)</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
