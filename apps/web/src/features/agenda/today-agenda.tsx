import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type Appointment,
} from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { localParts, STATUS_TONES } from './agenda-view';

/** Las citas de hoy del profesional en Inicio (RF-37): la hora de la organización, el tipo, el paciente y el estado. */
export function TodayAgenda({
  appointments,
  timezone,
  patientNames,
}: {
  appointments: readonly Appointment[];
  timezone: string;
  patientNames: Readonly<Record<string, string>>;
}) {
  const active = appointments.filter((a) => a.status !== 'CANCELLED');
  return (
    <section aria-labelledby="agenda-hoy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="agenda-hoy" className="text-lg font-semibold">
          Tu agenda de hoy
        </h2>
        <Link href="/panel/agenda" className="text-sm text-brand-text underline">
          Ver la agenda
        </Link>
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin citas hoy.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((appointment) => (
            <li
              key={appointment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span>
                <span className="font-medium tabular-nums">
                  {localParts(appointment.startsAt, timezone).time}
                </span>{' '}
                {APPOINTMENT_KIND_LABELS[appointment.kind]}
                {appointment.patientId && patientNames[appointment.patientId] ? (
                  <>
                    {' · '}
                    <Link
                      href={`/panel/pacientes/${appointment.patientId}`}
                      className="text-brand-text underline"
                    >
                      {patientNames[appointment.patientId]}
                    </Link>
                  </>
                ) : null}
              </span>
              <StatusBadge tone={STATUS_TONES[appointment.status]}>
                {APPOINTMENT_STATUS_LABELS[appointment.status]}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
