'use client';

import type { SupportSession } from '@nutricoach/contracts';
import { createContext, useContext, type ReactNode } from 'react';

export type MemberRole = 'OWNER' | 'ADMIN' | 'PROFESSIONAL';

export interface PanelSession {
  readonly userId: string;
  /** SUPPORT: el soporte de la plataforma en modo soporte, con el permiso del dueño (RN-A09, ADR-130). */
  readonly role: MemberRole | 'SUPPORT';
  readonly support: SupportSession | null;
  readonly organizationId: string;
  readonly organizationStatus: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED' | 'CLOSED';
  readonly timezone: string;
  readonly patientLabel: string;
}

const PanelSessionContext = createContext<PanelSession | null>(null);

export function PanelSessionProvider({
  value,
  children,
}: {
  value: PanelSession;
  children: ReactNode;
}) {
  return <PanelSessionContext.Provider value={value}>{children}</PanelSessionContext.Provider>;
}

export function usePanelSession(): PanelSession {
  const session = useContext(PanelSessionContext);
  if (!session) throw new Error('usePanelSession fuera del panel.');
  return session;
}

/**
 * Si la interfaz ofrece escribir: en solo lectura (RN-A02) y en modo soporte (RN-A09) los botones de escritura se desactivan. Es
 * comodidad: la API decide (TenantGuard responde 422 o 403).
 */
export function useCanWrite(): boolean {
  const { organizationStatus, support } = usePanelSession();
  return organizationStatus === 'ACTIVE' && support === null;
}

/** Lo que el rol puede hacer (decisión 6 de P5). La interfaz oculta; la API decide. */
export function useCan(): { manage: boolean; seeSubscription: boolean; grantOwner: boolean } {
  const { role } = usePanelSession();
  const manager = role === 'OWNER' || role === 'ADMIN';
  return { manage: manager, seeSubscription: manager, grantOwner: role === 'OWNER' };
}
