'use client';

import { cn } from '@nutricoach/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { path: '/alimentos', label: 'Alimentos' },
  { path: '/recetas', label: 'Recetas' },
  { path: '/plato', label: 'Armar un plato' },
  { path: '/actividades', label: 'Actividades' },
  { path: '/listas', label: 'Listas de intercambio' },
  { path: '/ejercicios', label: 'Ejercicios' },
  { path: '/patrones', label: 'Patrón y nivel' },
] as const;

/** Secciones de la Biblioteca (RF-38), con aria-current en la activa; Alimentos sigue activa en el detalle. */
export function LibraryTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de la Biblioteca" className="overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = `/panel/biblioteca${tab.path}`;
          const current = pathname === href || pathname.startsWith(`${href}/`);
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
