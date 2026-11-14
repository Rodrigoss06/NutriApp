'use client';

import type { Appointment, MemberResponse } from '@nutricoach/contracts';
import { useState } from 'react';
import { localParts } from './agenda-view';
import { AppointmentForm } from './appointment-form';
import { AppointmentItem } from './appointment-item';

const dayTitle = (date: string): string =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );

/** Las citas de un paciente en su expediente: las próximas primero y las pasadas, de la más reciente a la más antigua. */
export function PatientAppointments({
  appointments,
  timezone,
  members,
  ownMemberId,
  canManage,
  canWrite,
  patientLabel,
}: {
  appointments: readonly Appointment[];
  timezone: string;
  members: readonly MemberResponse[];
  ownMemberId: string | null;
  canManage: boolean;
  canWrite: boolean;
  patientLabel: string;
}) {
  const [now] = useState(() => new Date());
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const upcoming = appointments.filter((a) => Date.parse(a.endsAt) > now.getTime());
  const past = appointments.filter((a) => Date.parse(a.endsAt) <= now.getTime()).reverse();
  const list = (title: string, items: readonly Appointment[], empty: string) => (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      {items.map((appointment) => (
        <div key={appointment.id} className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {dayTitle(localParts(appointment.startsAt, timezone).date)}
          </p>
          <AppointmentItem
            appointment={appointment}
            timezone={timezone}
            now={now}
            patientName={null}
            memberName={memberNames.get(appointment.memberId) ?? null}
            outsideAvailability={false}
            canWrite={canWrite && (canManage || appointment.memberId === ownMemberId)}
            reschedule={(close) => (
              <AppointmentForm
                timezone={timezone}
                members={members}
                memberId={appointment.memberId}
                canChooseMember={false}
                patient={null}
                patientLabel={patientLabel}
                defaultDate={localParts(appointment.startsAt, timezone).date}
                appointment={appointment}
                onDone={close}
              />
            )}
          />
        </div>
      ))}
    </section>
  );
  return (
    <div className="flex flex-col gap-4">
      {list('Próximas', upcoming, 'Sin citas próximas.')}
      {list('Pasadas', past, 'Sin citas pasadas.')}
    </div>
  );
}
