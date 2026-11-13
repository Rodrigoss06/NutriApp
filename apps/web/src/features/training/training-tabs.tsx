'use client';

import type { Features } from '@nutricoach/contracts';
import { cn } from '@nutricoach/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { path: '', label: 'Resumen' },
  { path: '/perfil', label: 'Perfil' },
  { path: '/cribado', label: 'Cribado' },
  { path: '/postura', label: 'Postura' },
  { path: '/pruebas', label: 'Pruebas físicas' },
  { path: '/programas', label: 'Programas' },
  { path: '/control-semanal', label: 'Control semanal' },
  { path: '/informes', label: 'Informes', feature: 'MESOCYCLE_REPORT' },
  { path: '/fotos', label: 'Fotos', feature: 'PROGRESS_PHOTOS' },
] as const satisfies readonly { path: string; label: string; feature?: keyof Features }[];

/**
 * Las partes de la seguridad antes de prescribir (RF-41), los programas, su control semanal (RF-42), el informe de cada mesociclo
 * (RN-G19) y las fotos de progreso (RN-G20), con aria-current en la activa, también en sus páginas internas.
 */
export function TrainingTabs({
  patientId,
  features,
}: {
  patientId: string;
  /** Las banderas de la organización: lo apagado no se ofrece (ADR-127). */
  features: Features | null;
}) {
  const pathname = usePathname();
  const base = `/panel/pacientes/${patientId}/entrenamiento`;
  return (
    <nav aria-label="Secciones de entrenamiento" className="overflow-x-auto">
      <ul className="flex min-w-max gap-1">
        {TABS.filter((tab) => !('feature' in tab) || features?.[tab.feature] !== false).map(
          (tab) => {
            const href = `${base}${tab.path}`;
            const current =
              pathname === href || (tab.path !== '' && pathname.startsWith(`${href}/`));
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
          },
        )}
      </ul>
    </nav>
  );
}
