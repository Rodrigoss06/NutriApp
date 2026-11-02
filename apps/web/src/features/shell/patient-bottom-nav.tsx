'use client';

import type { AppSection } from '@nutricoach/contracts';
import { CalendarCheck, Dumbbell, Menu, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { NavLink, type NavItem } from './nav-link';

/** Cada pestaña con la sección de la app que la muestra; Hoy y Más siempre están. */
const ITEMS: readonly (NavItem & { section: AppSection | null })[] = [
  { href: '/mi/hoy', label: 'Hoy', icon: CalendarCheck, section: null },
  { href: '/mi/plan', label: 'Plan', icon: UtensilsCrossed, section: 'NUTRITION' },
  { href: '/mi/entreno', label: 'Entreno', icon: Dumbbell, section: 'TRAINING' },
  { href: '/mi/progreso', label: 'Progreso', icon: TrendingUp, section: 'EVOLUTION' },
  { href: '/mi/mas', label: 'Más', icon: Menu, section: null },
];

/** Barra inferior de la app: Hoy, Plan, Entreno, Progreso y Más, con objetivos táctiles de 44 px. */
export function PatientBottomNav({ sections }: { sections: readonly AppSection[] | null }) {
  const visible = ITEMS.filter(
    (item) => item.section === null || sections === null || sections.includes(item.section),
  );
  return (
    <nav
      aria-label="Secciones de la app"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-2xl">
        {visible.map((item) => (
          <NavLink key={item.href} item={item} variant="bottom" />
        ))}
      </div>
    </nav>
  );
}
