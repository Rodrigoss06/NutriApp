'use client';

import type { PatientDaySchedule, ScheduleDay, TodayActionInput } from '@nutricoach/contracts';
import { Button, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { CHANGE_LABELS, scheduleLine } from '@/features/patient-app/day-schedule';
import { apiFetch } from '@/lib/api/client';

/** «Lo que pide el programa»: sin perfil elegido por el coach. */
const PROGRAM = 'PROGRAM';

/**
 * Hoy y mañana del paciente para su equipo (P-20.3 y P-20.4, ADR-104): el perfil de cada día con sus kcal y sus sesiones, el
 * perfil que el coach elige para hoy o mañana, y «no entreno hoy», «mover a mañana» o deshacerlo por el paciente. Nada cambia
 * solo: sin cambios, manda el programa.
 */
export function ScheduleEditor({
  patientId,
  schedule,
}: {
  patientId: string;
  schedule: PatientDaySchedule;
}) {
  const router = useRouter();
  const base = `/patients/${encodeURIComponent(patientId)}/schedule`;
  const today = useMutation({
    mutationFn: (body: TodayActionInput) =>
      apiFetch<PatientDaySchedule>(`${base}/today`, { method: 'POST', body }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const profile = useMutation({
    mutationFn: ({ localDate, profileCode }: { localDate: string; profileCode: string | null }) =>
      apiFetch<PatientDaySchedule>(`${base}/${localDate}/profile`, {
        method: 'PUT',
        body: { profileCode },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const busy = today.isPending || profile.isPending;
  const { options, choices } = schedule;
  const days: readonly (readonly [string, ScheduleDay])[] = [
    ['Hoy', schedule.today],
    ['Mañana', schedule.tomorrow],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {days.map(([label, day]) => (
          <div
            key={day.localDate}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
          >
            <p className="font-medium">{label}</p>
            <p className="tabular-nums">{scheduleLine(day) || 'Sin plan ni programa vigentes'}</p>
            {day.change ? (
              <StatusBadge tone="info" className="self-start">
                {CHANGE_LABELS[day.change]}
              </StatusBadge>
            ) : null}
            {choices.length > 0 ? (
              <Select
                label={`Perfil de ${label.toLowerCase()}`}
                value={day.change === 'PROFILE' ? (day.profile?.code ?? PROGRAM) : PROGRAM}
                disabled={busy}
                onValueChange={(value) => {
                  profile.mutate({
                    localDate: day.localDate,
                    profileCode: value === PROGRAM ? null : value,
                  });
                }}
                options={[
                  { value: PROGRAM, label: 'Lo que pide el programa' },
                  ...choices.map((choice) => ({ value: choice.code, label: choice.name })),
                ]}
              />
            ) : null}
          </div>
        ))}
      </div>
      <FormError error={profile.error} title="No se cambió el perfil del día" />
      <FormError error={today.error} title="No se cambió el día" />
      {options.notTraining || options.moveToTomorrow || options.undo ? (
        <div className="flex flex-wrap gap-2">
          {options.notTraining ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                today.mutate({ action: 'NOT_TRAINING' });
              }}
            >
              No entrena hoy
            </Button>
          ) : null}
          {options.moveToTomorrow ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                today.mutate({ action: 'MOVE_TO_TOMORROW' });
              }}
            >
              Mover la sesión a mañana
            </Button>
          ) : null}
          {options.undo ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                today.mutate({ action: 'UNDO' });
              }}
            >
              Deshacer el cambio de hoy
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
