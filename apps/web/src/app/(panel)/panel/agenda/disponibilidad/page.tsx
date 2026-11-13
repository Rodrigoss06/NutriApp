import type { AvailabilityResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { AvailabilityEditor } from '@/features/agenda/availability-editor';
import { agendaViewer } from '@/features/agenda/server';
import { MemberChooser } from '@/features/agenda/member-chooser';
import { getOrganization } from '@/features/patients/server';
import { BackLink } from '@/features/shell/back-link';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Disponibilidad' };

/**
 * La disponibilidad semanal (RF-37, ADR-125): cada profesional cambia la suya; el dueño y el administrador, la de cualquiera.
 */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const asked = (await searchParams).profesional;
  const [organization, viewer] = await Promise.all([getOrganization(), agendaViewer()]);
  if (!organization.ok || !viewer.ok) {
    return <Notice tone="danger" title="No pudimos cargar la disponibilidad" />;
  }
  const memberId =
    viewer.canManage && typeof asked === 'string' && viewer.members.some((m) => m.id === asked)
      ? asked
      : viewer.ownMemberId;
  const member = viewer.members.find((m) => m.id === memberId);
  const availability = await serverApi<AvailabilityResponse>(`/members/${memberId}/availability`);
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <h1 className="text-2xl font-semibold">Disponibilidad</h1>
      {viewer.canManage ? <MemberChooser members={viewer.members} memberId={memberId} /> : null}
      {availability.ok ? (
        <AvailabilityEditor
          key={memberId}
          memberId={memberId}
          memberName={member?.displayName ?? 'el profesional'}
          slots={availability.data.slots}
          timezone={availability.data.timezone}
          canWrite={organization.data.status === 'ACTIVE'}
        />
      ) : (
        <Notice tone="danger" title="No pudimos cargar la disponibilidad" />
      )}
    </div>
  );
}
