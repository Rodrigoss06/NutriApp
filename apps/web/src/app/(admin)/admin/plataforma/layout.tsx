import type { AccountResponse } from '@nutricoach/contracts';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { PlatformNav } from '@/features/platform/platform-nav';
import { LogoutButton, RedirectToLogin } from '@/features/session/session-actions';
import { serverApi } from '@/lib/api/server';

/**
 * Guardia del panel interno: solo sesiones PLATFORM. Va en este layout anidado y no en el de (admin), para que
 * /admin/componentes siga sin sesión (solo local y staging). La API decide con @PlatformOnly.
 */
export default async function PlatformLayout({ children }: Readonly<{ children: ReactNode }>) {
  const account = await serverApi<AccountResponse>('/account');
  if (!account.ok) return <RedirectToLogin />;
  if (account.data.kind !== 'PLATFORM') redirect('/panel');
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="font-semibold">Panel interno</p>
          <PlatformNav />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">{children}</main>
    </div>
  );
}
