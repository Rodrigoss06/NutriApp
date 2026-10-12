import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { AuditView } from '@/features/audit/audit-view';
import { getMembers } from '@/features/patients/server';

export const metadata: Metadata = { title: 'Auditoría' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Auditoría para el dueño (RF-06). Los ingresos a la plataforma no tienen organización: solo los ve la plataforma. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { paciente } = await searchParams;
  const patientId = typeof paciente === 'string' && UUID.test(paciente) ? paciente : null;
  const members = await getMembers();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Quién leyó o cambió qué y cuándo en tu organización. Rango de 90 días como máximo.
        </p>
      </div>
      {members.ok ? (
        <AuditView members={members.data.members} patientId={patientId} />
      ) : (
        <Notice tone="danger" title="No pudimos cargar la auditoría" />
      )}
    </div>
  );
}
