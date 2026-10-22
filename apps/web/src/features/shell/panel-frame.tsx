'use client';

import {
  Building2,
  CalendarDays,
  Info,
  LayoutDashboard,
  Library,
  Menu,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, cn } from '@nutricoach/ui';
import { pluralLabel } from '@/features/organization/labels';
import { NavLink, type NavItem } from './nav-link';

/**
 * Marco del panel (ADR-051): en escritorio, un riel oscuro teñido con la marca de la organización a la izquierda y
 * el contenido sobre el papel; en el celular, la barra de arriba abre el mismo riel como menú. Solo el estado del
 * menú es de cliente; la marca, el buscador y el contenido llegan ya renderizados desde el servidor.
 */
export function PanelFrame({
  patientLabel,
  showAudit = false,
  brand,
  tools,
  notices,
  children,
}: {
  patientLabel: string;
  /** La auditoría solo aparece para el dueño (RF-06); la API decide igual. */
  showAudit?: boolean;
  brand: ReactNode;
  tools: ReactNode;
  /** Avisos de toda la sesión (RN-A02, perfil incompleto) sobre el contenido. */
  notices?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { href: '/panel', label: 'Inicio', icon: LayoutDashboard, exact: true },
    { href: '/panel/pacientes', label: pluralLabel(patientLabel), icon: Users },
    { href: '/panel/agenda', label: 'Agenda', icon: CalendarDays },
    { href: '/panel/biblioteca', label: 'Biblioteca', icon: Library },
    { href: '/panel/organizacion', label: 'Organización', icon: Building2 },
    { href: '/panel/ajustes', label: 'Ajustes', icon: Settings },
    ...(showAudit ? [{ href: '/panel/auditoria', label: 'Auditoría', icon: ShieldCheck }] : []),
    { href: '/panel/cuenta', label: 'Mi cuenta', icon: UserRound },
  ];

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:p-2"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-sm lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-expanded={open}
          aria-controls="panel-navigation"
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
          <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
        </Button>
        <span className="min-w-0 text-brand-text">{brand}</span>
      </header>

      <nav
        id="panel-navigation"
        aria-label="Secciones del panel"
        // Al elegir una sección desde el menú del celular, el menú se cierra.
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
        }}
        className={cn(
          'flex-col gap-1 bg-rail px-3 pb-6 text-rail-foreground',
          open ? 'fixed inset-x-0 top-16 bottom-0 z-40 flex overflow-y-auto pt-3' : 'hidden',
          'lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:pt-5',
        )}
      >
        <div className="mb-5 hidden px-3 lg:block">{brand}</div>
        {items.map((item) => (
          <NavLink key={item.href} item={item} variant="sidebar" />
        ))}
        <div className="mt-auto pt-4">
          <NavLink item={{ href: '/acerca', label: 'Acerca de', icon: Info }} variant="sidebar" />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-16 flex-wrap items-center justify-end gap-3 border-b border-border bg-card/70 px-4 py-3 lg:px-8 [&>form]:mr-auto [&>form]:w-auto [&>form]:min-w-48 [&>form]:flex-1">
          {tools}
        </div>
        <main id="contenido" className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:px-8 lg:py-7">
          {notices}
          {children}
        </main>
      </div>
    </div>
  );
}
