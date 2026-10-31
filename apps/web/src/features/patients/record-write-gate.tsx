'use client';

import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useWritesRecord } from './use-writes-record';

/** Por qué no se ofrece escribir y dónde se ve el equipo (RN-A05). `action` completa «Para…». */
export function CareTeamNotice({ patientId, action }: { patientId: string; action: string }) {
  return (
    <Notice
      tone="info"
      title={`Para ${action}, necesitas estar en su equipo de atención con acceso de escritura`}
      rule="RN-A05"
    >
      <Link href={`/panel/pacientes/${patientId}`} className="underline underline-offset-4">
        Ver el equipo de atención
      </Link>
    </Notice>
  );
}

/**
 * Lo que solo ve quien escribe datos de salud en este expediente. A los demás, por qué no (si hay `action`) y lo que sí pueden
 * leer (`fallback`). La interfaz oculta; la API decide.
 */
export function RecordWriteGate({
  patientId,
  careTeam,
  members,
  action,
  fallback,
  children,
}: {
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  action?: string;
  fallback?: ReactNode;
  children?: ReactNode;
}) {
  const writes = useWritesRecord(careTeam, members);
  if (writes) return <>{children}</>;
  return (
    <>
      {action ? <CareTeamNotice patientId={patientId} action={action} /> : null}
      {fallback}
    </>
  );
}
