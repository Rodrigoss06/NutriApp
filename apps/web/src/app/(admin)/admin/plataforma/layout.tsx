import type { AccountResponse } from '@nutricoach/contracts';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { RedirectToLogin } from '@/features/session/session-actions';
import { serverApi } from '@/lib/api/server';

/**
 * Guardia del panel interno: solo sesiones PLATFORM. Va en este layout anidado y no en el de (admin), para que
 * /admin/componentes siga sin sesión (solo local y staging). La API decide con @PlatformOnly.
 */
export default async function PlatformLayout({ children }: Readonly<{ children: ReactNode }>) {
  const account = await serverApi<AccountResponse>('/account');
  if (!account.ok) return <RedirectToLogin />;
  if (account.data.kind !== 'PLATFORM') redirect('/panel');
  return children;
}
