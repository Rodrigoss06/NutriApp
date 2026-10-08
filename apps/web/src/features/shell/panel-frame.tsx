'use client';

import {
  Building2,
  CalendarDays,
  LayoutDashboard,
  Library,
  Menu,
  Settings,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, cn } from '@nutricoach/ui';
import { pluralLabel } from '@/features/organization/labels';
import { NavLink, type NavItem } from './nav-link';

/**
 * Marco del panel: barra lateral fija en escritorio y desplegable en el celular. Solo el estado del menú es
 * de cliente; la marca, el buscador y el contenido llegan ya renderizados desde el servidor.
 */
export function PanelFrame({
  patientLabel,
  brand,
  tools,
  notices,
  children,
}: {
  patientLabel: string;
  brand: ReactNode;
  tools: ReactNode;
  /** Avisos de toda la sesión (RN-A02, perfil incompleto) sobre el contenido. */
  notices?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const items: NavItem[] = [
    { href: '/panel', label: 'Inicio', icon: LayoutDashboard },
    { href: '/panel/pacientes', label: pluralLabel(patientLabel), icon: Users },
    { href: '/panel/agenda', label: 'Agenda', icon: CalendarDays },
    { href: '/panel/biblioteca', label: 'Biblioteca', icon: Library },
    { href: '/panel/organizacion', label: 'Organización', icon: Building2 },
    { href: '/panel/ajustes', label: 'Ajustes', icon: Settings },
    { href: '/panel/cuenta', label: 'Mi cuenta', icon: UserRound },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2"
      >
        Saltar al contenido
      </a>
      <header className="flex h-16 items-center gap-3 border-b border-border px-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls="panel-navigation"
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
          <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
        </Button>
        {brand}
        <div className="ml-auto flex flex-1 items-center justify-end gap-3">{tools}</div>
      </header>
      <div className="flex flex-1">
        <nav
          id="panel-navigation"
          aria-label="Secciones del panel"
          className={cn(
            'flex-col gap-1 border-border bg-background p-3',
            open ? 'fixed inset-x-0 top-16 z-40 flex border-b' : 'hidden',
            'lg:static lg:flex lg:w-60 lg:border-r lg:border-b-0',
          )}
        >
          {items.map((item) => (
            <NavLink key={item.href} item={item} variant="sidebar" />
          ))}
        </nav>
        <main id="contenido" className="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-6">
          {notices}
          {children}
        </main>
      </div>
    </div>
  );
}
