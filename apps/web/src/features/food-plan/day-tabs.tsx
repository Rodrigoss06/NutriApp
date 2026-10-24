'use client';

import { cn } from '@nutricoach/ui';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { DAY_NAMES } from './draft';

export const dayTabId = (prefix: string, day: number) => `${prefix}-dia-${String(day)}`;
export const dayPanelId = (prefix: string, day: number) => `${prefix}-panel-${String(day)}`;

/**
 * Pestañas de lunes a domingo (patrón de pestañas de WAI-ARIA): las flechas cambian de día e Inicio y Fin van al
 * primero y al último. El panel del día lo pinta quien las usa, con dayPanelId.
 */
export function DayTabs({
  prefix,
  label,
  selected,
  onSelect,
  hint,
}: {
  prefix: string;
  label: string;
  selected: number;
  onSelect: (day: number) => void;
  /** Lo que se ve bajo cada día, como sus kcal. */
  hint?: (day: number) => ReactNode;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (day: number) => {
    const next = (day + DAY_NAMES.length) % DAY_NAMES.length;
    onSelect(next);
    tabs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: number) => {
    const moves: Readonly<Record<string, number>> = {
      ArrowRight: day + 1,
      ArrowLeft: day - 1,
      Home: 0,
      End: DAY_NAMES.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    go(target);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {DAY_NAMES.map((name, day) => {
        const active = day === selected;
        return (
          <button
            key={name}
            ref={(element) => {
              tabs.current[day] = element;
            }}
            id={dayTabId(prefix, day)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={dayPanelId(prefix, day)}
            tabIndex={active ? 0 : -1}
            className={cn(
              'flex min-h-11 shrink-0 flex-col items-center justify-center rounded-t-md border-b-2 px-3 py-1 text-sm',
              active
                ? 'border-brand font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => {
              onSelect(day);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, day);
            }}
          >
            {name}
            {hint ? <span className="text-xs font-normal tabular-nums">{hint(day)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
