'use client';

import { Select } from '@nutricoach/ui';
import { dayProfilesBody, type DayProfileRow } from '@/features/nutrition-plan/day-profiles';

/** Un perfil de día cuyas porciones se escriben (P-20.5). */
export interface ProfileOption {
  readonly code: string;
  readonly name: string;
}

const TRAINING = 'TRAINING';

/**
 * Los perfiles del borrador con su código: el guardado o, en uno nuevo, el que tomará de su nombre al guardar. Mientras algún
 * perfil no sirva, solo los guardados.
 */
export function profileOptionsOf(rows: readonly DayProfileRow[]): ProfileOption[] {
  const body = dayProfilesBody(rows);
  if (body) return body.map(({ code, name }) => ({ code, name }));
  return rows.flatMap((row) => (row.code ? [{ code: row.code, name: row.name.trim() }] : []));
}

/**
 * De qué tipo de día se escriben las porciones (07 §2, P-20.5): Entrenamiento es el plan; en un perfil solo cambia la cantidad
 * de cada alimento, y lo que no se cambia es lo del plan.
 */
export function ProfileSwitch({
  options,
  value,
  onChange,
}: {
  options: readonly ProfileOption[];
  value: ProfileOption | null;
  onChange: (profile: ProfileOption | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="max-w-xs">
      <Select
        label="Porciones de"
        hint="En un perfil cambias solo la cantidad de cada alimento; lo que dejas vacío es lo del plan, y 0 es «ese día no va»."
        value={value?.code ?? TRAINING}
        onValueChange={(code) => {
          onChange(options.find((option) => option.code === code) ?? null);
        }}
        options={[
          { value: TRAINING, label: 'Entrenamiento (el plan)' },
          ...options.map((option) => ({ value: option.code, label: option.name })),
        ]}
      />
    </div>
  );
}
