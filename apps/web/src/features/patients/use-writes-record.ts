'use client';

import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';
import { usePanelSession } from '@/features/session/panel-session';

/** Si quien mira está en el equipo de atención con escritura (RN-A05). La interfaz oculta; la API decide. */
export function useWritesRecord(
  careTeam: readonly CareTeamMember[],
  members: readonly MemberResponse[],
): boolean {
  const { userId } = usePanelSession();
  const memberId = members.find((m) => m.userId === userId)?.id;
  return careTeam.some((m) => m.memberId === memberId && m.access === 'WRITE');
}
