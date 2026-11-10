'use client';

import type { DaySchedule, TodayActionInput } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { CalendarClock } from 'lucide-react';
import { FormError } from '@/features/forms/form-error';
import { scheduleLine, todayNotice } from './day-schedule';
import { newActionKey, useMeAction } from './records';

/**
 * Hoy y mañana (P-20.3, ADR-104): el perfil de cada día con sus kcal y sus sesiones, y lo que el paciente puede avisar hoy. «No
 * entreno hoy» baja la meta de hoy a Descanso; «mover a mañana» pasa la sesión a mañana; «sí entreno hoy» lo deshace mientras sea
 * hoy. Nada cambia solo.
 */
export function DayScheduleCard({ schedule }: { schedule: DaySchedule }) {
  const action = useMeAction<DaySchedule>('/me/schedule/today');
  const notice = todayNotice(schedule);
  const { options } = schedule;
  const run = (body: TodayActionInput) => {
    action.mutate({ body, key: newActionKey() });
  };
  return (
    <section aria-labelledby="agenda-dia" className="rounded-xl border border-border bg-card p-4">
      <h2 id="agenda-dia" className="flex items-center gap-2 text-lg font-semibold">
        <CalendarClock aria-hidden className="size-5" /> Hoy y mañana
      </h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-medium">Hoy</dt>
        <dd className="tabular-nums">{scheduleLine(schedule.today)}</dd>
        <dt className="font-medium">Mañana</dt>
        <dd className="tabular-nums">{scheduleLine(schedule.tomorrow)}</dd>
      </dl>
      {notice ? <Notice tone="info" title={notice} className="mt-3" /> : null}
      <FormError error={action.error} title="No se cambió tu día" />
      {options.notTraining || options.moveToTomorrow || options.undo ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.notTraining ? (
            <Button
              variant="secondary"
              size="touch"
              disabled={action.isPending}
              onClick={() => {
                run({ action: 'NOT_TRAINING' });
              }}
            >
              No entreno hoy
            </Button>
          ) : null}
          {options.moveToTomorrow ? (
            <Button
              variant="secondary"
              size="touch"
              disabled={action.isPending}
              onClick={() => {
                run({ action: 'MOVE_TO_TOMORROW' });
              }}
            >
              Mover a mañana
            </Button>
          ) : null}
          {options.undo ? (
            <Button
              variant="secondary"
              size="touch"
              disabled={action.isPending}
              onClick={() => {
                run({ action: 'UNDO' });
              }}
            >
              Sí entreno hoy
            </Button>
          ) : null}
        </div>
      ) : null}
      {options.notTraining || options.moveToTomorrow ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Si hoy no entrenas, avísalo aquí: tu meta de comida pasa a la de descanso.
        </p>
      ) : null}
    </section>
  );
}
