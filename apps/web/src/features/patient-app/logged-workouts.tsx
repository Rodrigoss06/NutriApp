'use client';

import { formatNumber, type MeTraining } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import Link from 'next/link';
import { FormError } from '@/features/forms/form-error';
import { useVoid } from './records';

const OUTCOME_LABELS: Readonly<Record<MeTraining['workouts'][number]['outcome'], string>> = {
  COMPLETED: 'Completa',
  PARTIAL: 'Parcial',
  SKIPPED: 'No la hiciste',
};

/**
 * Las sesiones registradas hoy (RF-29) con su tonelaje (RN-F03); anular no borra (RN-G12). El registro diario ya hecho no se
 * recalcula solo (RN-D08): si se hizo antes de la sesión, se invita a actualizarlo.
 */
export function LoggedWorkouts({
  workouts,
  sessionNames,
  hasCheckin,
  checkinEnabled,
}: {
  workouts: MeTraining['workouts'];
  sessionNames: Readonly<Record<string, string>>;
  hasCheckin: boolean;
  checkinEnabled: boolean;
}) {
  const voiding = useVoid('/me/workouts');
  return (
    <section aria-labelledby="entreno-registrado" className="flex flex-col gap-2">
      <h2 id="entreno-registrado" className="text-lg font-semibold">
        Lo que registraste hoy
      </h2>
      <ul className="flex flex-col gap-2">
        {workouts.map((workout) => {
          const name = (workout.sessionId && sessionNames[workout.sessionId]) || 'Sesión';
          return (
            <li
              key={workout.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
            >
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{name}</span>
                <span className="text-sm text-muted-foreground">
                  {OUTCOME_LABELS[workout.outcome]}
                </span>
              </p>
              {workout.outcome === 'SKIPPED' ? null : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Tonelaje</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {formatNumber(workout.tonnageKg, 'trainingLoad')} kg
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Series</dt>
                    <dd className="text-lg font-semibold tabular-nums">{workout.setCount}</dd>
                  </div>
                  {workout.durationMinutes !== null ? (
                    <div>
                      <dt className="text-muted-foreground">Duración</dt>
                      <dd className="tabular-nums">{workout.durationMinutes} min</dd>
                    </div>
                  ) : null}
                  {workout.sessionRpe !== null ? (
                    <div>
                      <dt className="text-muted-foreground">RPE</dt>
                      <dd className="tabular-nums">{formatNumber(workout.sessionRpe, 'index')}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
              <Button
                variant="secondary"
                size="touch"
                disabled={voiding.isPending}
                onClick={() => {
                  voiding.mutate(workout.id);
                }}
              >
                Anular<span className="sr-only"> {name}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <FormError error={voiding.error} title="No se anuló la sesión" />
      {checkinEnabled ? (
        hasCheckin ? (
          <Notice tone="info" title="Ya hiciste tu registro diario de hoy">
            Si lo hiciste antes de esta sesión, actualízalo para que tu indicación la tenga en
            cuenta.{' '}
            <Link href="/mi/registro" className="font-medium text-brand-text underline">
              Actualizar mi registro diario
            </Link>
          </Notice>
        ) : (
          <Link
            href="/mi/registro"
            className="flex min-h-touch items-center font-medium text-brand-text underline"
          >
            Hacer mi registro diario
          </Link>
        )
      ) : null}
    </section>
  );
}
