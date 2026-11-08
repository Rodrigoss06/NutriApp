'use client';

import { methodLabel, type DayProfile } from '@nutricoach/contracts';
import { Button, formatNumber, MethodBadge } from '@nutricoach/ui';
import { Plus, Trash2 } from 'lucide-react';
import { TextField } from '@/features/forms/fields';
import {
  customProfileRow,
  dayProfileErrors,
  REST_CODE,
  restProfileRow,
  withoutProfile,
  type DayProfileRow,
} from './day-profiles';

const MAX_PROFILES = 6;

interface Targets {
  readonly proteinG: number;
  readonly fatG: number;
}

/**
 * Los perfiles de día del plan (07 §2; P-20, respuestas de Jeremy): Entrenamiento es la meta de la prescripción; Descanso y los
 * perfiles propios llevan sus gramos, con la proteína y la grasa de Entrenamiento ya puestas (P-20.1). Las kcal las calcula la
 * API desde los gramos (P-20.2) y se ven con su método. El programa elige el perfil de cada día por su sesión.
 */
export function DayProfilesCard({
  rows,
  training,
  calculated,
  disabled,
  onChange,
}: {
  rows: readonly DayProfileRow[];
  training: Targets;
  /** Los perfiles de lo guardado o de la vista previa, en el mismo orden que las filas. */
  calculated: readonly DayProfile[];
  disabled: boolean;
  onChange: (rows: readonly DayProfileRow[]) => void;
}) {
  const hasRest = rows.some((row) => row.code === REST_CODE);
  const change = (key: string, field: keyof Omit<DayProfileRow, 'key' | 'code'>, value: string) => {
    onChange(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };
  return (
    <section
      aria-labelledby="perfiles-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id="perfiles-titulo" className="font-semibold">
          Perfiles de día
        </h3>
        <p className="text-sm text-muted-foreground">
          Entrenamiento es la meta de arriba. Cada perfil lleva sus gramos y sus kcal salen de
          ellos. El programa elige el de cada día: el de su sesión, y Descanso en los días sin
          sesión. Sin perfiles, el plan tiene una sola meta.
        </p>
      </div>

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const errors = dayProfileErrors(row);
            const profile = calculated[index];
            const label = row.name.trim() || (row.code === REST_CODE ? 'Descanso' : 'Perfil nuevo');
            return (
              <li key={row.key}>
                <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-medium">{label}</legend>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <TextField
                      label="Nombre"
                      autoComplete="off"
                      maxLength={40}
                      disabled={disabled}
                      value={row.name}
                      error={errors.name}
                      onChange={(event) => {
                        change(row.key, 'name', event.target.value);
                      }}
                    />
                    <TextField
                      label="Carbohidratos (g)"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={disabled}
                      value={row.choG}
                      error={errors.choG}
                      onChange={(event) => {
                        change(row.key, 'choG', event.target.value);
                      }}
                    />
                    <TextField
                      label="Proteína (g)"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={disabled}
                      value={row.proteinG}
                      error={errors.proteinG}
                      onChange={(event) => {
                        change(row.key, 'proteinG', event.target.value);
                      }}
                    />
                    <TextField
                      label="Grasa (g)"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={disabled}
                      value={row.fatG}
                      error={errors.fatG}
                      onChange={(event) => {
                        change(row.key, 'fatG', event.target.value);
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Energía:</span>
                      <span className="font-semibold tabular-nums">
                        {profile ? `${formatNumber(profile.kcal, 'kcal')} kcal` : '—'}
                      </span>
                      {profile ? (
                        <MethodBadge
                          label={methodLabel(profile.method.methodCode)}
                          code={profile.method.methodCode}
                          version={profile.method.methodVersion}
                        />
                      ) : null}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => {
                        onChange(withoutProfile(rows, row.key));
                      }}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      Quitar {label}
                    </Button>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {hasRest ? null : (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || rows.length >= MAX_PROFILES}
            onClick={() => {
              onChange([...rows, restProfileRow(training, crypto.randomUUID())]);
            }}
          >
            <Plus aria-hidden className="size-4" />
            Agregar Descanso
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || rows.length >= MAX_PROFILES}
          onClick={() => {
            onChange([...rows, customProfileRow(training, crypto.randomUUID())]);
          }}
        >
          <Plus aria-hidden className="size-4" />
          Agregar perfil
        </Button>
      </div>
    </section>
  );
}
