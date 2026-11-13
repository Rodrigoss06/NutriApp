'use client';

import { cn } from '@nutricoach/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin/plataforma', label: 'Organizaciones' },
  { href: '/admin/plataforma/planes', label: 'Planes' },
] as const;

/** Las secciones del panel interno (RF-39), con aria-current en la activa. */
export function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel interno">
      <ul className="flex gap-1">
        {LINKS.map((link) => {
          const current =
            link.href === '/admin/plataforma'
              ? pathname === link.href || pathname.startsWith('/admin/plataforma/organizaciones')
              : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-touch items-center border-b-2 px-3 text-sm font-medium',
                  current
                    ? 'border-brand text-brand-text'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
