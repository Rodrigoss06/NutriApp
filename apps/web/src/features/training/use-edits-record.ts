'use client';

import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite } from '@/features/session/panel-session';

/** Si la interfaz ofrece escribir en este expediente: organización activa, paciente activo y equipo con WRITE. Decide la API. */
export function useEditsRecord(
  careTeam: readonly CareTeamMember[],
  members: readonly MemberResponse[],
  archived: boolean,
): boolean {
  const canWrite = useCanWrite();
  const writesRecord = useWritesRecord(careTeam, members);
  return canWrite && writesRecord && !archived;
}
