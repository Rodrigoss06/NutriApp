'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@nutricoach/ui';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Solo activo en su ruta exacta: «Inicio» (/panel) no debe quedar activo en las demás secciones. */
  readonly exact?: boolean;
}

/** ¿Es la sección de la ruta actual? Las secciones incluyen sus subrutas, salvo las exactas. */
export function isActive(item: Pick<NavItem, 'href' | 'exact'>, pathname: string): boolean {
  if (pathname === item.href) return true;
  return !item.exact && pathname.startsWith(`${item.href}/`);
}

/**
 * Enlace de navegación con aria-current="page" en la sección activa. En el riel oscuro del panel, la activa se
 * aclara y lleva una marca con el color de la organización (RN-H03); en la barra de la app, el ícono y el texto
 * toman la marca y una raya la señala arriba.
 */
export function NavLink({ item, variant }: { item: NavItem; variant: 'sidebar' | 'bottom' }) {
  const pathname = usePathname();
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative',
        variant === 'sidebar' &&
          'flex min-h-touch items-center gap-3 rounded-md px-3 text-sm font-medium text-rail-muted transition-colors hover:bg-white/5 hover:text-rail-foreground',
        variant === 'sidebar' && active && 'bg-white/[0.08] text-rail-foreground',
        variant === 'bottom' &&
          'flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium text-muted-foreground',
        variant === 'bottom' && active && 'text-brand-text',
      )}
    >
      {active ? (
        <span
          aria-hidden
          data-nav-marker
          className={cn(
            'absolute bg-brand',
            variant === 'sidebar' && 'inset-y-2.5 -left-3 w-[3px] rounded-r-full',
            variant === 'bottom' && 'inset-x-1/4 top-0 h-[3px] rounded-b-full',
          )}
        />
      ) : null}
      <Icon aria-hidden className={variant === 'bottom' ? 'size-6' : 'size-5'} />
      {item.label}
    </Link>
  );
}
