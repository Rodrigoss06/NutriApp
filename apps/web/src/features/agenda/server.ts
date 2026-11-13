import 'server-only';
import type { AccountResponse, MemberResponse, PatientListResponse } from '@nutricoach/contracts';
import { getMembers } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

/**
 * Quién mira la agenda: su fila de miembro y si gestiona la organización (el dueño y el administrador). El soporte en modo soporte
 * (ADR-130) no es miembro: mira la agenda de todos o la de quien elija, sin escribir.
 */
export async function agendaViewer(): Promise<
  | {
      readonly ok: true;
      readonly members: readonly MemberResponse[];
      readonly ownMemberId: string | null;
      readonly canManage: boolean;
    }
  | { readonly ok: false }
> {
  const [account, members] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    getMembers(),
  ]);
  if (!account.ok || !members.ok) return { ok: false };
  if (account.data.support) {
    return { ok: true, members: members.data.members, ownMemberId: null, canManage: true };
  }
  const own = members.data.members.find((member) => member.userId === account.data.id);
  const role = account.data.memberships.find(
    (membership) => membership.organizationId === account.data.activeOrganizationId,
  )?.role;
  if (!own) return { ok: false };
  return {
    ok: true,
    members: members.data.members,
    ownMemberId: own.id,
    canManage: role === 'OWNER' || role === 'ADMIN',
  };
}

/** Los nombres de los pacientes de las citas, de /patients: la agenda no lee nombres. Los que el contexto no ve no vuelven. */
export async function patientNamesOf(
  patientIds: readonly string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(patientIds)].slice(0, 100);
  if (unique.length === 0) return {};
  const list = await serverApi<PatientListResponse>(`/patients?ids=${unique.join(',')}&limit=100`);
  if (!list.ok) return {};
  return Object.fromEntries(list.data.patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
}
