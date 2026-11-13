'use client';

import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_MODE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type Appointment,
  type ChangeAppointmentStatus,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock, ExternalLink, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { FormError } from '@/features/forms/form-error';
import { changeAppointmentStatus } from './agenda-api';
import { availableActions, localParts, STATUS_TONES } from './agenda-view';

/**
 * Una cita de la agenda (RF-37): la hora en la zona de la organización (RN-J03), el tipo, el paciente, dónde y su estado (color,
 * ícono y texto). Las acciones son las que la API permite (ADR-076); la asistencia se valida desde que empieza la cita.
 */
export function AppointmentItem({
  appointment,
  timezone,
  patientName,
  memberName,
  outsideAvailability,
  canWrite,
  now,
  reschedule,
}: {
  appointment: Appointment;
  timezone: string;
  patientName: string | null;
  memberName: string | null;
  outsideAvailability: boolean;
  canWrite: boolean;
  now: Date;
  /** El formulario para reprogramarla, si quien mira puede. */
  reschedule: ((close: () => void) => ReactNode) | null;
}) {
  const router = useRouter();
  const start = localParts(appointment.startsAt, timezone);
  const end = localParts(appointment.endsAt, timezone);
  const actions = availableActions(appointment, now);
  const change = useMutation({
    mutationFn: (status: ChangeAppointmentStatus['status']) =>
      changeAppointmentStatus(appointment, status),
    onSuccess: () => {
      router.refresh();
    },
  });
  const what = `${APPOINTMENT_KIND_LABELS[appointment.kind]} de las ${start.time}`;
  return (
    <article
      aria-label={`${what}${patientName ? ` con ${patientName}` : ''}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium tabular-nums">
          {start.time}–{end.time}
          <span className="ml-2 font-normal">{APPOINTMENT_KIND_LABELS[appointment.kind]}</span>
        </p>
        <StatusBadge tone={STATUS_TONES[appointment.status]}>
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </StatusBadge>
      </div>
      {patientName && appointment.patientId ? (
        <Link
          href={`/panel/pacientes/${appointment.patientId}`}
          className="w-fit text-sm text-brand-text underline"
        >
          {patientName}
        </Link>
      ) : null}
      {memberName ? <p className="text-sm text-muted-foreground">Con {memberName}</p> : null}
      <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {appointment.mode === 'VIRTUAL' ? (
          appointment.meetingUrl ? (
            <a
              href={appointment.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand-text underline"
            >
              <ExternalLink aria-hidden className="size-4" />
              Virtual: abrir el enlace<span className="sr-only"> en otra pestaña</span>
            </a>
          ) : (
            APPOINTMENT_MODE_LABELS.VIRTUAL
          )
        ) : (
          <>
            <MapPin aria-hidden className="size-4" />
            {appointment.location ?? APPOINTMENT_MODE_LABELS.IN_PERSON}
          </>
        )}
      </p>
      {appointment.notes ? <p className="text-sm">{appointment.notes}</p> : null}
      {outsideAvailability ? (
        <p className="flex items-center gap-1 text-sm text-warning">
          <CalendarClock aria-hidden className="size-4" />
          Fuera de la disponibilidad
        </p>
      ) : null}
      {appointment.attendancePending ? (
        <p className="text-sm text-warning">Falta validar la asistencia.</p>
      ) : null}
      {canWrite ? (
        <AppointmentActions
          appointment={appointment}
          actions={actions}
          busy={change.isPending}
          onStatus={(status) => {
            change.mutate(status);
          }}
          reschedule={reschedule}
        />
      ) : null}
      <FormError error={change.error} title="No se cambió la cita" />
    </article>
  );
}

function AppointmentActions({
  appointment,
  actions,
  busy,
  onStatus,
  reschedule,
}: {
  appointment: Appointment;
  actions: ReturnType<typeof availableActions>;
  busy: boolean;
  onStatus: (status: ChangeAppointmentStatus['status']) => void;
  reschedule: ((close: () => void) => ReactNode) | null;
}) {
  const editing = useEditing();
  if (editing.open && reschedule) {
    return <>{reschedule(editing.close)}</>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.confirm ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            onStatus('CONFIRMED');
          }}
        >
          Confirmar
        </Button>
      ) : null}
      {actions.attendance && appointment.status !== 'COMPLETED' ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            onStatus('COMPLETED');
          }}
        >
          Asistió
        </Button>
      ) : null}
      {actions.attendance && appointment.status !== 'NO_SHOW' ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            onStatus('NO_SHOW');
          }}
        >
          No asistió
        </Button>
      ) : null}
      {actions.reschedule && reschedule ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={editing.show}>
          Reprogramar
        </Button>
      ) : null}
      {actions.cancel ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" disabled={busy}>
              Cancelar la cita
            </Button>
          }
          title="¿Cancelar la cita?"
          description="El horario queda libre. La cita sigue en la agenda como cancelada y no se puede reactivar."
          confirmLabel="Cancelar la cita"
          cancelLabel="Volver"
          tone="danger"
          onConfirm={() => {
            onStatus('CANCELLED');
          }}
        />
      ) : null}
    </div>
  );
}

function useEditing(): { open: boolean; show: () => void; close: () => void } {
  const [open, setOpen] = useState(false);
  return {
    open,
    show: () => {
      setOpen(true);
    },
    close: () => {
      setOpen(false);
    },
  };
}
