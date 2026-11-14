import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type MeAppointment,
  type MeAppointmentsResponse,
} from '@nutricoach/contracts';
import { EmptyState, Notice, StatusBadge } from '@nutricoach/ui';
import { CalendarDays, ExternalLink, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { STATUS_TONES } from '@/features/agenda/agenda-view';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Tus citas' };

const when = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(
    new Date(iso),
  );

function AppointmentCard({
  appointment,
  timezone,
}: {
  appointment: MeAppointment;
  timezone: string;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{APPOINTMENT_KIND_LABELS[appointment.kind]}</p>
        <StatusBadge tone={STATUS_TONES[appointment.status]}>
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </StatusBadge>
      </div>
      <p className="first-letter:uppercase">{when(appointment.startsAt, timezone)}</p>
      {appointment.mode === 'VIRTUAL' ? (
        appointment.meetingUrl && appointment.status !== 'CANCELLED' ? (
          <a
            href={appointment.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch w-fit items-center gap-1 text-brand-text underline"
          >
            <ExternalLink aria-hidden className="size-4" />
            Entrar a la cita virtual<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">
            Virtual: tu profesional te enviará el enlace.
          </p>
        )
      ) : (
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin aria-hidden className="size-4" />
          {appointment.location ?? 'Presencial'}
        </p>
      )}
    </li>
  );
}

/** Tus citas (RF-37): las próximas y las de los últimos 90 días, en la hora de tu organización (RN-J03). */
export default async function Page() {
  const response = await serverApi<MeAppointmentsResponse>('/me/appointments');
  if (!response.ok) return <Notice tone="danger" title="No pudimos cargar tus citas" />;
  const { upcoming, past, timezone } = response.data;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tus citas</h1>
      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Todavía no tienes citas"
          description="Cuando tu profesional agende una cita contigo, la verás aquí y te llegará un recordatorio por correo el día antes."
        />
      ) : (
        <>
          <section aria-labelledby="proximas" className="flex flex-col gap-2">
            <h2 id="proximas" className="text-lg font-semibold">
              Próximas
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin citas próximas.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    timezone={timezone}
                  />
                ))}
              </ul>
            )}
          </section>
          {past.length > 0 ? (
            <section aria-labelledby="pasadas" className="flex flex-col gap-2">
              <h2 id="pasadas" className="text-lg font-semibold">
                Pasadas
              </h2>
              <ul className="flex flex-col gap-2">
                {past.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    timezone={timezone}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
