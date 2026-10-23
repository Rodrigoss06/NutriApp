'use client';

import { cn } from '@nutricoach/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { path: '', label: 'Ficha' },
  { path: '/consentimientos', label: 'Consentimientos' },
  { path: '/historia', label: 'Historia clínica' },
  { path: '/registros', label: 'Condiciones, objetivos y notas' },
  { path: '/evaluaciones', label: 'Evaluaciones' },
  { path: '/energia', label: 'Energía' },
  { path: '/dieta', label: 'Dieta' },
  { path: '/linea-de-tiempo', label: 'Línea de tiempo' },
] as const;

/**
 * Secciones del expediente (RF-09 a RF-19), con aria-current en la activa. Evaluaciones, energía y dieta siguen activas
 * en sus páginas internas (una evaluación, su comparación, una prescripción, un plan).
 */
export function RecordTabs({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const base = `/panel/pacientes/${patientId}`;
  return (
    <nav aria-label="Secciones del expediente" className="overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = `${base}${tab.path}`;
          const current = pathname === href || (tab.path !== '' && pathname.startsWith(`${href}/`));
          return (
            <li key={tab.path}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-touch items-center border-b-2 px-3 text-sm font-medium',
                  current
                    ? 'border-brand text-brand-text'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
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
