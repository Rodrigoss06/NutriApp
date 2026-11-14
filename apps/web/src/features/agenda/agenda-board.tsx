'use client';

import {
  APPOINTMENT_KIND_LABELS,
  type Appointment,
  type AvailabilitySlot,
  type MemberResponse,
} from '@nutricoach/contracts';
import { Button, cn, Select } from '@nutricoach/ui';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { TableScroll } from '@/features/shell/table-scroll';
import {
  byLocalDate,
  isoWeekday,
  localParts,
  monthWeeks,
  outsideAvailability,
  shift,
  weekDays,
  type AgendaView,
} from './agenda-view';
import { AppointmentForm } from './appointment-form';
import { AppointmentItem } from './appointment-item';
import type { PickedPatient } from './patient-picker';

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const ALL = 'todos';

const dayTitle = (date: string): string =>
  new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));

const monthTitle = (date: string): string =>
  new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date.slice(0, 7)}-15T12:00:00Z`),
  );

export interface AgendaBoardProps {
  readonly view: AgendaView;
  readonly date: string;
  readonly today: string;
  readonly timezone: string;
  readonly appointments: readonly Appointment[];
  readonly members: readonly MemberResponse[];
  /** null: la agenda de todos los profesionales (solo el dueño y el administrador). */
  readonly memberId: string | null;
  readonly ownMemberId: string;
  readonly slots: readonly AvailabilitySlot[];
  readonly patientNames: Readonly<Record<string, string>>;
  readonly canManage: boolean;
  readonly canWrite: boolean;
  readonly patientLabel: string;
  readonly preselected: PickedPatient | null;
}

/**
 * La agenda del panel (RF-37, ADR-125): la semana o el mes, de un profesional o, para el dueño y el administrador, de todos; la
 * disponibilidad del profesional a la vista y las citas fuera de ella marcadas; crear, confirmar, reprogramar, cancelar y validar la
 * asistencia. Las horas son las de la organización (RN-J03).
 */
export function AgendaBoard(props: AgendaBoardProps) {
  const { view, date, today, timezone, memberId, canManage, canWrite, preselected } = props;
  const router = useRouter();
  const [creating, setCreating] = useState(preselected !== null);
  const [now] = useState(() => new Date());
  const hrefFor = (next: { view?: AgendaView; date?: string; member?: string | null }) => {
    const params = new URLSearchParams({
      vista: (next.view ?? view) === 'week' ? 'semana' : 'mes',
      fecha: next.date ?? date,
    });
    const member = next.member === undefined ? memberId : next.member;
    params.set('profesional', member ?? ALL);
    return `/panel/agenda?${params.toString()}`;
  };
  const memberNames = new Map(props.members.map((member) => [member.id, member.displayName]));
  const days = byLocalDate(props.appointments, timezone);
  const itemFor = (appointment: Appointment) => (
    <AppointmentItem
      key={appointment.id}
      appointment={appointment}
      timezone={timezone}
      now={now}
      patientName={
        appointment.patientId
          ? (props.patientNames[appointment.patientId] ?? `${props.patientLabel} sin acceso`)
          : null
      }
      memberName={memberId === null ? (memberNames.get(appointment.memberId) ?? null) : null}
      outsideAvailability={
        memberId !== null && outsideAvailability(appointment, props.slots, timezone)
      }
      canWrite={canWrite && (canManage || appointment.memberId === props.ownMemberId)}
      reschedule={(close) => (
        <AppointmentForm
          timezone={timezone}
          members={props.members}
          memberId={appointment.memberId}
          canChooseMember={false}
          patient={null}
          patientLabel={props.patientLabel}
          defaultDate={today}
          appointment={appointment}
          onDone={close}
        />
      )}
    />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Período de la agenda" className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href={hrefFor({ date: shift(view, date, -1) })}>
              <ChevronLeft aria-hidden />
              <span className="sr-only">
                {view === 'week' ? 'Semana anterior' : 'Mes anterior'}
              </span>
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={hrefFor({ date: today })}>Hoy</Link>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link href={hrefFor({ date: shift(view, date, 1) })}>
              <ChevronRight aria-hidden />
              <span className="sr-only">
                {view === 'week' ? 'Semana siguiente' : 'Mes siguiente'}
              </span>
            </Link>
          </Button>
          <p className="font-medium first-letter:uppercase" aria-live="polite">
            {view === 'week'
              ? `Semana del ${dayTitle(weekDays(date)[0] as string)}`
              : monthTitle(date)}
          </p>
        </nav>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-md border border-border" role="group" aria-label="Vista">
            {(['week', 'month'] as const).map((option) => (
              <Link
                key={option}
                href={hrefFor({ view: option })}
                aria-current={view === option ? 'page' : undefined}
                className={cn(
                  'flex min-h-9 items-center px-3 text-sm',
                  view === option ? 'bg-brand text-brand-foreground' : 'hover:bg-muted',
                )}
              >
                {option === 'week' ? 'Semana' : 'Mes'}
              </Link>
            ))}
          </div>
          {canManage ? (
            <Select
              label="Profesional"
              className="w-56"
              value={memberId ?? ALL}
              onValueChange={(value) => {
                router.push(hrefFor({ member: value === ALL ? null : value }));
              }}
              options={[
                { value: ALL, label: 'Todos los profesionales' },
                ...props.members
                  .filter((member) => member.status === 'ACTIVE')
                  .map((member) => ({ value: member.id, label: member.displayName })),
              ]}
            />
          ) : null}
          {canWrite && !creating ? (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <CalendarPlus aria-hidden />
              Nueva cita
            </Button>
          ) : null}
        </div>
      </div>
      {creating ? (
        <AppointmentForm
          timezone={timezone}
          members={props.members}
          memberId={memberId ?? props.ownMemberId}
          canChooseMember={canManage}
          patient={preselected}
          patientLabel={props.patientLabel}
          defaultDate={date < today ? today : date}
          onDone={() => {
            setCreating(false);
          }}
        />
      ) : null}
      {memberId !== null && props.slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin disponibilidad cargada.{' '}
          <Link href="/panel/agenda/disponibilidad" className="text-brand-text underline">
            Cargar la disponibilidad
          </Link>
        </p>
      ) : null}
      {view === 'week' ? (
        <WeekView {...props} days={days} itemFor={itemFor} />
      ) : (
        <MonthView {...props} days={days} hrefFor={hrefFor} />
      )}
    </div>
  );
}

function WeekView({
  date,
  today,
  slots,
  memberId,
  days,
  itemFor,
}: AgendaBoardProps & {
  days: Map<string, Appointment[]>;
  itemFor: (appointment: Appointment) => ReactNode;
}) {
  return (
    <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Días de la semana">
      {weekDays(date).map((day) => {
        const list = days.get(day) ?? [];
        const daySlots = slots.filter((slot) => slot.dayOfWeek === isoWeekday(day));
        return (
          <li key={day} className="flex flex-col gap-2">
            <h2
              className={cn(
                'font-medium first-letter:uppercase',
                day === today && 'text-brand-text',
              )}
            >
              {dayTitle(day)}
              {day === today ? <span className="ml-2 text-sm font-normal">(hoy)</span> : null}
            </h2>
            {memberId !== null && daySlots.length > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Disponible {daySlots.map((slot) => `${slot.startTime}–${slot.endTime}`).join(', ')}
              </p>
            ) : null}
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin citas.</p>
            ) : (
              list.map(itemFor)
            )}
          </li>
        );
      })}
    </ol>
  );
}

function MonthView({
  date,
  today,
  timezone,
  days,
  hrefFor,
}: AgendaBoardProps & {
  days: Map<string, Appointment[]>;
  hrefFor: (next: { view?: AgendaView; date?: string }) => string;
}) {
  const month = date.slice(0, 7);
  return (
    <TableScroll label="Citas del mes">
      <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
        <caption className="sr-only">Citas del mes, por día</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th
                key={weekday}
                scope="col"
                className="p-2 text-left font-medium first-letter:uppercase"
              >
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(date).map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const active = (days.get(day) ?? []).filter((a) => a.status !== 'CANCELLED');
                return (
                  <td
                    key={day}
                    className={cn(
                      'h-24 border border-border p-2 align-top',
                      day.slice(0, 7) !== month && 'text-muted-foreground',
                    )}
                  >
                    <Link
                      href={hrefFor({ view: 'week', date: day })}
                      className={cn(
                        'font-medium tabular-nums underline-offset-2 hover:underline',
                        day === today && 'text-brand-text',
                      )}
                    >
                      <span aria-hidden>{Number(day.slice(8))}</span>
                      <span className="sr-only">
                        {dayTitle(day)}:{' '}
                        {active.length === 1 ? '1 cita' : `${String(active.length)} citas`}
                      </span>
                    </Link>
                    <ul className="mt-1 flex flex-col gap-0.5" aria-hidden>
                      {active.slice(0, 3).map((appointment) => (
                        <li key={appointment.id} className="truncate">
                          <span className="tabular-nums">
                            {localParts(appointment.startsAt, timezone).time}
                          </span>{' '}
                          {APPOINTMENT_KIND_LABELS[appointment.kind]}
                        </li>
                      ))}
                      {active.length > 3 ? <li>y {String(active.length - 3)} más</li> : null}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
