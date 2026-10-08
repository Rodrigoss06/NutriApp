import type { AccountResponse, SessionListResponse } from '@nutricoach/contracts';
import type { AccountView, SessionView } from '../../../application/queries/account.queries.js';

export function toAccountResponse(view: AccountView): AccountResponse {
  return {
    id: view.id,
    email: view.email,
    displayName: view.displayName,
    kind: view.kind,
    activeOrganizationId: view.activeOrganizationId,
    memberships: view.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      role: m.role,
    })),
  };
}

export function toSessionList(sessions: readonly SessionView[]): SessionListResponse {
  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      current: s.current,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      userAgent: s.userAgent,
    })),
  };
}
