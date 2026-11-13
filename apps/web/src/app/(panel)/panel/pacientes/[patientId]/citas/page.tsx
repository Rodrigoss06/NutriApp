import type { AgendaResponse } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { CalendarPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PatientAppointments } from '@/features/agenda/patient-appointments';
import { agendaViewer } from '@/features/agenda/server';
import { Section } from '@/features/patients/section';
import { getOrganization, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Citas' };

/** Las citas del paciente (RF-37, RF-10): las próximas y las pasadas, con su estado y la asistencia. */
export default async function PatientAppointmentsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, appointments, organization, viewer] = await Promise.all([
    getPatient(patientId),
    serverApi<AgendaResponse>(`/patients/${encodeURIComponent(patientId)}/appointments`),
    getOrganization(),
    agendaViewer(),
  ]);
  if (!patient.ok) return null;
  if (!appointments.ok || !organization.ok || !viewer.ok) {
    return <Notice tone="danger" title="No pudimos cargar las citas" />;
  }
  const writable = organization.data.status === 'ACTIVE';
  return (
    <Section
      title="Citas"
      description="Las citas en la hora de la organización. La asistencia se valida desde que empieza cada cita."
    >
      {writable ? (
        <Button asChild className="w-fit">
          <Link href={`/panel/agenda?paciente=${patientId}`}>
            <CalendarPlus aria-hidden />
            Nueva cita
          </Link>
        </Button>
      ) : null}
      <PatientAppointments
        appointments={appointments.data.appointments}
        timezone={appointments.data.timezone}
        members={viewer.members}
        ownMemberId={viewer.ownMemberId}
        canManage={viewer.canManage}
        canWrite={writable}
        patientLabel={organization.data.patientLabel}
      />
    </Section>
  );
}
