'use client';

import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';
import { usePanelSession } from '@/features/session/panel-session';
import { managesPatient, memberIdOf, writesClinical, writesRecord } from './record-access';

/** Si quien mira escribe datos de salud en este expediente (RN-A05). La interfaz oculta; la API decide. */
export function useWritesRecord(
  careTeam: readonly CareTeamMember[],
  members: readonly MemberResponse[],
): boolean {
  const { userId } = usePanelSession();
  return writesRecord(careTeam, memberIdOf(members, userId));
}

/** Si quien mira cambia los datos de la ficha, los consentimientos o la invitación a la app. */
export function useWritesClinical(
  careTeam: readonly CareTeamMember[],
  members: readonly MemberResponse[],
): boolean {
  const { role, userId } = usePanelSession();
  return writesClinical(role, careTeam, memberIdOf(members, userId));
}

/** Si quien mira archiva, reactiva, cambia de responsable y arma el equipo de atención. */
export function useManagesPatient(
  responsibleMemberId: string,
  members: readonly MemberResponse[],
): boolean {
  const { role, userId } = usePanelSession();
  return managesPatient(role, responsibleMemberId, memberIdOf(members, userId));
}
