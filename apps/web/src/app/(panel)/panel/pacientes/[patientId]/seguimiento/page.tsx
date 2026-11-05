import type { AppNotesResponse, PatientDay } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { shiftDate } from '@/features/patient-records/adjustments';
import { DayView } from '@/features/patient-records/day-view';
import { UnreadNotes } from '@/features/patient-records/unread-notes';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Seguimiento' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const longDate = (date: string): string =>
  new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

/**
 * Lo que el paciente registra en su app, día por día, como lo ve su equipo (RN-G01): en solo lectura, con los ajustes del
 * profesional (RN-G02) y sus notas nuevas, que quedan leídas al abrirlas (RN-G13). Leerlo queda en la auditoría (RN-B03). El día
 * es la fecha local del paciente (RN-G04).
 */
export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { patientId } = await params;
  const { fecha } = await searchParams;
  const patient = await getPatient(patientId);
  if (!patient.ok) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: patient.data.timezone }).format(
    new Date(),
  );
  const requested = typeof fecha === 'string' && ISO_DATE.test(fecha) ? fecha : today;
  const date = requested > today ? today : requested;
  const id = encodeURIComponent(patientId);
  const [day, unread, members] = await Promise.all([
    serverApi<PatientDay>(`/patients/${id}/records/${date}`),
    serverApi<AppNotesResponse>(`/patients/${id}/app-notes/unread`),
    getMembers(),
  ]);
  if (!day.ok || !unread.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar el seguimiento" />;
  }
  const base = `/panel/pacientes/${patientId}/seguimiento`;
  return (
    <div className="flex flex-col gap-8">
      <UnreadNotes patientId={patientId} notes={unread.data.notes} />
      <Section
        title="Registros de la app"
        description="Lo que registró el paciente, tal cual. No se edita: si algo no corresponde, se ajusta con un motivo y el original se conserva."
      >
        <nav aria-label="Elegir el día" className="flex flex-wrap items-center gap-2">
          <Link
            href={`${base}?fecha=${shiftDate(date, -1)}`}
            className="flex min-h-touch items-center gap-1 rounded-md px-2 text-sm font-medium text-brand-text hover:bg-muted"
          >
            <ChevronLeft aria-hidden className="size-4" />
            Día anterior
          </Link>
          <p className="min-w-40 text-center font-medium first-letter:uppercase" aria-live="polite">
            {longDate(date)}
            {date === today ? ' · hoy' : ''}
          </p>
          {date < today ? (
            <Link
              href={`${base}?fecha=${shiftDate(date, 1)}`}
              className="flex min-h-touch items-center gap-1 rounded-md px-2 text-sm font-medium text-brand-text hover:bg-muted"
            >
              Día siguiente
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : null}
        </nav>
        <DayView
          day={day.data}
          patientId={patientId}
          careTeam={patient.data.careTeam}
          members={members.data.members}
        />
      </Section>
    </div>
  );
}
