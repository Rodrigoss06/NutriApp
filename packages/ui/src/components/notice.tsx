import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<Tone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

/** Palabra que acompaña al color y al ícono (WCAG 1.4.1): nunca solo color. */
const TONE_LABEL: Record<Tone, string> = {
  info: 'Información',
  success: 'Listo',
  warning: 'Aviso',
  danger: 'Error',
};

const noticeVariants = cva('flex gap-3 rounded-lg border p-4 text-sm', {
  variants: {
    tone: {
      info: 'border-info/40 bg-info-surface text-info',
      success: 'border-success/40 bg-success-surface text-success',
      warning: 'border-warning/40 bg-warning-surface text-warning',
      danger: 'border-danger/40 bg-danger-surface text-danger',
    },
  },
});

export interface NoticeProps {
  readonly tone: Tone;
  readonly title: ReactNode;
  readonly children?: ReactNode;
  /** Código de regla que lo explica, como `RN-E04` (03): el profesional lo puede consultar. */
  readonly rule?: string;
  readonly className?: string;
}

/** Aviso con ícono, texto y, si aplica, la regla. Los errores se anuncian de inmediato. */
export function Notice({ tone, title, children, rule, className }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(noticeVariants({ tone }), className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">
          <span className="sr-only">{TONE_LABEL[tone]}: </span>
          {title}
          {rule ? <span className="ml-2 font-normal text-foreground/70">({rule})</span> : null}
        </p>
        {children ? <div className="text-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

export interface StatusBadgeProps {
  readonly tone: Tone;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Estado corto («En rango», «Fuera de rango»): color, ícono y texto juntos. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  const Icon = ICONS[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'info' && 'bg-info-surface text-info',
        tone === 'success' && 'bg-success-surface text-success',
        tone === 'warning' && 'bg-warning-surface text-warning',
        tone === 'danger' && 'bg-danger-surface text-danger',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}
