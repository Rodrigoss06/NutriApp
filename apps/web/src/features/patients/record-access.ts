import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';

/**
 * Las tres reglas de quién hace qué en un expediente, iguales a las de la API (clinical-rules.ts, RN-A05). La interfaz oculta
 * con ellas lo que la API negaría; la que decide es la API.
 */

type MemberRole = MemberResponse['role'];

export const memberIdOf = (members: readonly MemberResponse[], userId: string): string | null =>
  members.find((m) => m.userId === userId)?.id ?? null;

/** Datos de salud: quien está en el equipo de atención con WRITE, también frente al dueño (canWriteRecord). */
export const writesRecord = (
  careTeam: readonly CareTeamMember[],
  memberId: string | null,
): boolean => careTeam.some((m) => m.memberId === memberId && m.access === 'WRITE');

/** Datos de la ficha, consentimientos e invitación a la app: el dueño o el equipo con WRITE (canWriteClinical). */
export const writesClinical = (
  role: MemberRole,
  careTeam: readonly CareTeamMember[],
  memberId: string | null,
): boolean => role === 'OWNER' || writesRecord(careTeam, memberId);

/** Archivar, reactivar, cambiar de responsable y armar el equipo: el responsable, el dueño o un administrador (canManagePatient). */
export const managesPatient = (
  role: MemberRole,
  responsibleMemberId: string,
  memberId: string | null,
): boolean => role === 'OWNER' || role === 'ADMIN' || memberId === responsibleMemberId;
