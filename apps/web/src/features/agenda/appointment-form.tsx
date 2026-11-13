'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_KINDS,
  APPOINTMENT_MODE_LABELS,
  APPOINTMENT_MODES,
  type Appointment,
  type MemberResponse,
} from '@nutricoach/contracts';
import { Button, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { instantIn } from '@/lib/dates';
import { bookAppointment, editAppointment } from './agenda-api';
import { durationMinutes, localParts } from './agenda-view';
import { PatientPicker, type PickedPatient } from './patient-picker';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180] as const;

const formSchema = z.object({
  memberId: z.string().min(1, 'Elige el profesional.'),
  kind: z.enum(APPOINTMENT_KINDS),
  mode: z.enum(APPOINTMENT_MODES),
  date: z.iso.date({ message: 'Elige la fecha.' }),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Elige la hora.'),
  duration: z.string(),
  location: z.string().trim().max(200, 'Hasta 200 caracteres.'),
  meetingUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (value) => value === '' || /^https:\/\/\S+$/.test(value),
      'Un enlace que empiece con https://',
    ),
  notes: z.string().trim().max(1000, 'Hasta 1000 caracteres.'),
});
type FormValues = z.infer<typeof formSchema>;

const optional = (value: string): string | undefined => (value === '' ? undefined : value);
const nullable = (value: string): string | null => (value === '' ? null : value);

/**
 * Crear o reprogramar una cita (RF-37): la fecha y la hora son las de la organización (RN-J03). El dueño y el administrador eligen
 * el profesional; los demás, su propia agenda. Un cruce lo rechaza la API con RN-J01 y el mensaje se ve aquí.
 */
export function AppointmentForm({
  timezone,
  members,
  memberId,
  canChooseMember,
  patient: initialPatient,
  patientLabel,
  defaultDate,
  appointment,
  onDone,
}: {
  timezone: string;
  members: readonly MemberResponse[];
  memberId: string;
  canChooseMember: boolean;
  patient: PickedPatient | null;
  patientLabel: string;
  defaultDate: string;
  /** Con una cita, la reprograma. */
  appointment?: Appointment;
  onDone: () => void;
}) {
  const router = useRouter();
  const [patient, setPatient] = useState<PickedPatient | null>(initialPatient);
  const start = appointment ? localParts(appointment.startsAt, timezone) : null;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberId: appointment?.memberId ?? memberId,
      kind: appointment?.kind ?? (initialPatient ? 'FOLLOW_UP' : 'CONSULTATION'),
      mode: appointment?.mode ?? 'IN_PERSON',
      date: start?.date ?? defaultDate,
      time: start?.time ?? '09:00',
      duration: String(appointment ? durationMinutes(appointment) : 45),
      location: appointment?.location ?? '',
      meetingUrl: appointment?.meetingUrl ?? '',
      notes: appointment?.notes ?? '',
    },
  });
  const mode = useWatch({ control: form.control, name: 'mode' });
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const startsAt = instantIn(`${values.date}T${values.time}`, timezone);
      const endsAt = new Date(
        Date.parse(startsAt) + Number(values.duration) * 60_000,
      ).toISOString();
      const isVirtual = values.mode === 'VIRTUAL';
      if (appointment) {
        return editAppointment(appointment, {
          kind: values.kind,
          mode: values.mode,
          startsAt,
          endsAt,
          location: isVirtual ? null : nullable(values.location),
          meetingUrl: isVirtual ? nullable(values.meetingUrl) : null,
          notes: nullable(values.notes),
        });
      }
      return bookAppointment({
        memberId: values.memberId,
        ...(patient ? { patientId: patient.id } : {}),
        kind: values.kind,
        mode: values.mode,
        startsAt,
        endsAt,
        ...(isVirtual
          ? { meetingUrl: optional(values.meetingUrl) }
          : { location: optional(values.location) }),
        notes: optional(values.notes),
      });
    },
    onSuccess: () => {
      router.refresh();
      onDone();
    },
  });
  const errors = form.formState.errors;
  const memberOptions = members
    .filter((member) => member.status === 'ACTIVE')
    .map((member) => ({ value: member.id, label: member.displayName }));
  return (
    <form
      noValidate
      aria-label={appointment ? 'Reprogramar la cita' : 'Nueva cita'}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(values);
        }),
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {canChooseMember && !appointment ? (
          <Controller
            control={form.control}
            name="memberId"
            render={({ field }) => (
              <Select
                label="Profesional"
                value={field.value}
                onValueChange={field.onChange}
                options={memberOptions}
                error={errors.memberId?.message}
              />
            )}
          />
        ) : null}
        {appointment ? null : (
          <PatientPicker
            label={`${patientLabel} (opcional)`}
            value={patient}
            onChange={setPatient}
          />
        )}
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Select
              label="Tipo"
              value={field.value}
              onValueChange={field.onChange}
              options={APPOINTMENT_KINDS.map((kind) => ({
                value: kind,
                label: APPOINTMENT_KIND_LABELS[kind],
              }))}
            />
          )}
        />
        <Controller
          control={form.control}
          name="mode"
          render={({ field }) => (
            <Select
              label="Modalidad"
              value={field.value}
              onValueChange={field.onChange}
              options={APPOINTMENT_MODES.map((value) => ({
                value,
                label: APPOINTMENT_MODE_LABELS[value],
              }))}
            />
          )}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label="Fecha"
          type="date"
          error={errors.date?.message}
          {...form.register('date')}
        />
        <TextField
          label="Hora"
          type="time"
          step={300}
          error={errors.time?.message}
          {...form.register('time')}
        />
        <Controller
          control={form.control}
          name="duration"
          render={({ field }) => (
            <Select
              label="Duración"
              value={field.value}
              onValueChange={field.onChange}
              options={DURATIONS.map((minutes) => ({
                value: String(minutes),
                label: `${String(minutes)} min`,
              }))}
            />
          )}
        />
      </div>
      {mode === 'VIRTUAL' ? (
        <TextField
          label="Enlace de la reunión (opcional)"
          hint="Solo https. La app no lo abre ni lo sincroniza."
          inputMode="url"
          autoComplete="off"
          error={errors.meetingUrl?.message}
          {...form.register('meetingUrl')}
        />
      ) : (
        <TextField
          label="Lugar (opcional)"
          autoComplete="off"
          error={errors.location?.message}
          {...form.register('location')}
        />
      )}
      <TextAreaField
        label="Nota para ti (opcional)"
        hint={`El ${patientLabel.toLowerCase()} no la ve.`}
        rows={2}
        error={errors.notes?.message}
        {...form.register('notes')}
      />
      <FormError
        error={save.error}
        title={appointment ? 'No se reprogramó la cita' : 'No se guardó la cita'}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {appointment ? 'Guardar cambios' : 'Guardar cita'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
