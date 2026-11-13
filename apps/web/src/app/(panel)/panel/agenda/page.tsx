import type { AgendaResponse, AvailabilityResponse, PatientResponse } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AgendaBoard } from '@/features/agenda/agenda-board';
import { rangeFor, type AgendaView } from '@/features/agenda/agenda-view';
import { agendaViewer, patientNamesOf } from '@/features/agenda/server';
import { getOrganization } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Agenda' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * La agenda (RF-37; RN-J01 a RN-J03; ADR-125): la semana o el mes, en la hora de la organización. El profesional ve la suya; el
 * dueño y el administrador, la de cualquiera o la de todos. ?paciente= abre la cita nueva con ese paciente.
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [organization, viewer] = await Promise.all([getOrganization(), agendaViewer()]);
  if (!organization.ok || !viewer.ok) {
    return <Notice tone="danger" title="No pudimos cargar la agenda" />;
  }
  const timezone = organization.data.timezone;
  const today = todayIn(timezone);
  const view: AgendaView = first(params.vista) === 'mes' ? 'month' : 'week';
  const date = DATE.test(first(params.fecha) ?? '') ? (first(params.fecha) as string) : today;
  const asked = first(params.profesional);
  const memberId =
    viewer.canManage && asked === 'todos'
      ? null
      : viewer.canManage && asked && viewer.members.some((m) => m.id === asked)
        ? asked
        : viewer.ownMemberId;
  const { from, to } = rangeFor(view, date);
  const patientParam = first(params.paciente);
  const [agenda, availability, preselected] = await Promise.all([
    serverApi<AgendaResponse>(
      `/appointments?from=${from}&to=${to}${memberId ? `&memberId=${memberId}` : ''}`,
    ),
    memberId ? serverApi<AvailabilityResponse>(`/members/${memberId}/availability`) : null,
    patientParam && UUID.test(patientParam)
      ? serverApi<PatientResponse>(`/patients/${patientParam}`)
      : null,
  ]);
  if (!agenda.ok) return <Notice tone="danger" title="No pudimos cargar la agenda" />;
  const patientNames = await patientNamesOf(
    agenda.data.appointments.flatMap((a) => (a.patientId ? [a.patientId] : [])),
  );
  const writable = organization.data.status === 'ACTIVE';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <Button asChild variant="secondary" size="sm">
          <Link href="/panel/agenda/disponibilidad">
            <Clock aria-hidden />
            Disponibilidad
          </Link>
        </Button>
      </div>
      <AgendaBoard
        view={view}
        date={date}
        today={today}
        timezone={timezone}
        appointments={agenda.data.appointments}
        members={viewer.members}
        memberId={memberId}
        ownMemberId={viewer.ownMemberId}
        slots={availability?.ok ? availability.data.slots : []}
        patientNames={patientNames}
        canManage={viewer.canManage}
        canWrite={writable}
        patientLabel={organization.data.patientLabel}
        preselected={
          preselected?.ok
            ? {
                id: preselected.data.id,
                name: `${preselected.data.firstName} ${preselected.data.lastName}`,
              }
            : null
        }
      />
    </div>
  );
}
