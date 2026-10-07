'use client';

import { CalendarCheck, Dumbbell, Menu, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { NavLink, type NavItem } from './nav-link';

const ITEMS: NavItem[] = [
  { href: '/mi/hoy', label: 'Hoy', icon: CalendarCheck },
  { href: '/mi/plan', label: 'Plan', icon: UtensilsCrossed },
  { href: '/mi/entreno', label: 'Entreno', icon: Dumbbell },
  { href: '/mi/progreso', label: 'Progreso', icon: TrendingUp },
  { href: '/mi/mas', label: 'Más', icon: Menu },
];

/** Barra inferior de la app: Hoy, Plan, Entreno, Progreso y Más, con objetivos táctiles de 44 px. */
export function PatientBottomNav() {
  return (
    <nav
      aria-label="Secciones de la app"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-2xl">
        {ITEMS.map((item) => (
          <NavLink key={item.href} item={item} variant="bottom" />
        ))}
      </div>
    </nav>
  );
}
