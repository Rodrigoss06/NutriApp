'use client';

import { cn } from '@nutricoach/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { path: '', label: 'Resumen' },
  { path: '/perfil', label: 'Perfil' },
  { path: '/cribado', label: 'Cribado' },
  { path: '/postura', label: 'Postura' },
  { path: '/pruebas', label: 'Pruebas físicas' },
] as const;

/** Las partes de la seguridad antes de prescribir (RF-41), con aria-current en la activa, también en sus páginas internas. */
export function TrainingTabs({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const base = `/panel/pacientes/${patientId}/entrenamiento`;
  return (
    <nav aria-label="Secciones de entrenamiento" className="overflow-x-auto">
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
