'use client';

import { cn } from '@nutricoach/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { path: '', label: 'Dieta' },
  { path: '/rutina', label: 'Rutina' },
] as const;

/** La analítica del paciente (RF-32, RF-33): dieta y rutina, con aria-current en la activa. */
export function AnalyticsTabs({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const base = `/panel/pacientes/${patientId}/analitica`;
  return (
    <nav aria-label="Secciones de la analítica" className="overflow-x-auto">
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = `${base}${tab.path}`;
          const current = pathname === href;
          return (
            <li key={tab.path}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-touch items-center rounded-md px-3 text-sm font-medium',
                  current
                    ? 'bg-surface text-brand-text'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
