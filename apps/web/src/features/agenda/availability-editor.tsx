'use client';

import type { AvailabilitySlot } from '@nutricoach/contracts';
import { Button, Input, Label, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { saveAvailability } from './agenda-api';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface Row extends AvailabilitySlot {
  readonly key: number;
}

/**
 * La disponibilidad semanal de un profesional (RF-37, ADR-125): franjas por día en la hora de la organización (RN-J03), sin cruces
 * el mismo día. Guardar reemplaza la semana entera. Orienta la agenda: una cita fuera de ella se puede poner y se marca.
 */
export function AvailabilityEditor({
  memberId,
  memberName,
  slots,
  timezone,
  canWrite,
}: {
  memberId: string;
  memberName: string;
  slots: readonly AvailabilitySlot[];
  timezone: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => slots.map((slot, key) => ({ ...slot, key })));
  const [nextKey, setNextKey] = useState(slots.length);
  const save = useMutation({
    mutationFn: () =>
      saveAvailability(memberId, {
        slots: rows.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })),
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const update = (key: number, patch: Partial<AvailabilitySlot>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  return (
    <form
      aria-label={`Disponibilidad de ${memberName}`}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">Horas de la organización ({timezone}).</p>
      <ol className="flex flex-col gap-3">
        {WEEKDAYS.map((weekday, index) => {
          const dayOfWeek = index + 1;
          const dayRows = rows.filter((row) => row.dayOfWeek === dayOfWeek);
          return (
            <li
              key={weekday}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{weekday}</h2>
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRows((current) => [
                        ...current,
                        { key: nextKey, dayOfWeek, startTime: '08:00', endTime: '13:00' },
                      ]);
                      setNextKey((key) => key + 1);
                    }}
                  >
                    <Plus aria-hidden />
                    Agregar franja<span className="sr-only"> el {weekday.toLowerCase()}</span>
                  </Button>
                ) : null}
              </div>
              {dayRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin atención.</p>
              ) : null}
              {dayRows.map((row, position) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`desde-${String(row.key)}`}>
                      Desde
                      <span className="sr-only">
                        {' '}
                        (franja {String(position + 1)} del {weekday.toLowerCase()})
                      </span>
                    </Label>
                    <Input
                      id={`desde-${String(row.key)}`}
                      type="time"
                      step={900}
                      value={row.startTime}
                      disabled={!canWrite}
                      onChange={(event) => {
                        update(row.key, { startTime: event.target.value });
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`hasta-${String(row.key)}`}>
                      Hasta
                      <span className="sr-only">
                        {' '}
                        (franja {String(position + 1)} del {weekday.toLowerCase()})
                      </span>
                    </Label>
                    <Input
                      id={`hasta-${String(row.key)}`}
                      type="time"
                      step={900}
                      value={row.endTime}
                      disabled={!canWrite}
                      onChange={(event) => {
                        update(row.key, { endTime: event.target.value });
                      }}
                    />
                  </div>
                  {canWrite ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setRows((current) => current.filter((other) => other.key !== row.key));
                      }}
                    >
                      <Trash2 aria-hidden />
                      <span className="sr-only">
                        Quitar la franja {String(position + 1)} del {weekday.toLowerCase()}
                      </span>
                    </Button>
                  ) : null}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
      <FormError error={save.error} title="No se guardó la disponibilidad" />
      {save.isSuccess ? <Notice tone="success" title="Disponibilidad guardada" /> : null}
      {canWrite ? (
        <Button type="submit" className="w-fit" disabled={save.isPending}>
          Guardar disponibilidad
        </Button>
      ) : null}
    </form>
  );
}
