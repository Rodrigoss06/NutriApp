'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@nutricoach/ui';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Enlace de navegación con aria-current="page" en la sección activa. */
export function NavLink({ item, variant }: { item: NavItem; variant: 'sidebar' | 'bottom' }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        variant === 'sidebar' &&
          'flex min-h-touch items-center gap-3 rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted',
        variant === 'sidebar' && active && 'bg-brand text-brand-foreground hover:bg-brand',
        variant === 'bottom' &&
          'flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium text-muted-foreground',
        variant === 'bottom' && active && 'text-brand-text',
      )}
    >
      <Icon aria-hidden className={variant === 'bottom' ? 'size-6' : 'size-5'} />
      {item.label}
    </Link>
  );
}
