'use client';

import {
  readinessThresholdValuesSchema,
  type ReadinessThresholdsResponse,
  type ReadinessThresholdValues,
} from '@nutricoach/contracts';
import { Button, Notice, NumberField, type MeasureUnit } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatDate } from '@/lib/dates';

type Field = keyof ReadinessThresholdValues;

/** Los parámetros de 07 §11, con su uso. */
const FIELDS: readonly {
  readonly key: Field;
  readonly label: string;
  readonly use: string;
  readonly unit?: MeasureUnit;
}[] = [
  {
    key: 'neutralScore',
    label: 'Valor neutral si falta un dato del reloj o su línea base',
    use: 'No interpreta la ausencia como mal estado. De 0 a 100.',
  },
  {
    key: 'readinessGreenMin',
    label: 'Recuperación verde desde',
    use: 'Mantener el plan. De 0 a 100.',
  },
  {
    key: 'readinessRedBelow',
    label: 'Recuperación roja por debajo de',
    use: 'Recuperar y revisar. De 0 a 100.',
  },
  {
    key: 'performanceMinPct',
    label: 'Rendimiento mínimo',
    use: 'Plan frente a real.',
    unit: '%',
  },
  {
    key: 'weeklySleepMinHours',
    label: 'Sueño mínimo semanal',
    use: 'Alerta del control semanal.',
    unit: 'h',
  },
  {
    key: 'fatigueSorenessAmberAbove',
    label: 'Fatiga o dolor en ámbar por encima de',
    use: 'Ajustar la carga. De 1 a 5.',
  },
  {
    key: 'nutritionMinPct',
    label: 'Alimentación mínima',
    use: 'Revisar la adherencia.',
    unit: '%',
  },
];

const valuesOf = (row: ReadinessThresholdsResponse['current']): ReadinessThresholdValues => ({
  neutralScore: row.neutralScore,
  readinessGreenMin: row.readinessGreenMin,
  readinessRedBelow: row.readinessRedBelow,
  performanceMinPct: row.performanceMinPct,
  weeklySleepMinHours: row.weeklySleepMinHours,
  fatigueSorenessAmberAbove: row.fatigueSorenessAmberAbove,
  nutritionMinPct: row.nutritionMinPct,
});

const NUMBER = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/**
 * Los umbrales de la indicación del día y del control semanal (07 §11, RN-G15, RN-G16), editables por la organización y
 * versionados: guardar crea la versión de hoy (o corrige la de hoy), y lo ya calculado no cambia (RN-D08). Los ve todo el
 * equipo; los cambian el dueño y los administradores (la API decide).
 */
export function ReadinessThresholdsSetting({
  initial,
  canEdit,
}: {
  initial: ReadinessThresholdsResponse;
  canEdit: boolean;
}) {
  const canWrite = useCanWrite() && canEdit;
  const [state, setState] = useState(initial);
  const [values, setValues] = useState<Partial<Record<Field, number | null>>>(() =>
    valuesOf(initial.current),
  );
  const [formKey, setFormKey] = useState(0);
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});
  const save = useMutation({
    mutationFn: (body: ReadinessThresholdValues) =>
      apiFetch<ReadinessThresholdsResponse>('/organization/readiness-thresholds', {
        method: 'PUT',
        body,
      }),
    onSuccess: (saved) => {
      setState(saved);
      setValues(valuesOf(saved.current));
      setFormKey((key) => key + 1);
    },
  });
  const { current, base, own } = state;

  const status = own ? (
    <p className="text-sm">
      Rigen los de tu organización desde el {formatDate(current.validFrom)}.
    </p>
  ) : (
    <p className="text-sm">Rigen los valores base de la plantilla V3 de JV Fitness.</p>
  );

  if (!canWrite) {
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        {status}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div
              key={field.key}
              className="flex items-baseline justify-between gap-3 border-b border-border py-1"
            >
              <dt className="text-sm text-muted-foreground">{field.label}</dt>
              <dd className="font-medium tabular-nums">
                {NUMBER.format(current[field.key])}
                {field.unit ? ` ${field.unit}` : ''}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">Los cambian el dueño y los administradores.</p>
      </div>
    );
  }

  const submit = () => {
    const parsed = readinessThresholdValuesSchema.safeParse(values);
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field | undefined;
        if (key && !found[key]) {
          found[key] = values[key] === null ? 'Escribe un número.' : issue.message;
        }
      }
      setProblems(found);
      return;
    }
    setProblems({});
    save.mutate(parsed.data);
  };

  return (
    <form
      noValidate
      aria-label="Umbrales del entrenamiento"
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {status}
      <div key={formKey} className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <NumberField
            key={field.key}
            label={field.label}
            {...(field.unit ? { unit: field.unit } : {})}
            value={values[field.key] ?? null}
            onValueChange={(value) => {
              setValues((current) => ({ ...current, [field.key]: value }));
            }}
            hint={`${field.use} Base: ${NUMBER.format(base[field.key])}.`}
            error={problems[field.key]}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Al guardar, rigen desde hoy. Las indicaciones del día y los controles semanales ya
        calculados conservan los umbrales con que se calcularon.
      </p>
      {save.isSuccess ? (
        <Notice tone="success" title="Umbrales guardados: rigen desde hoy" />
      ) : null}
      <FormError error={save.error} title="No se guardaron los umbrales" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar umbrales'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={save.isPending}
          onClick={() => {
            setValues(valuesOf(base));
            setProblems({});
            setFormKey((key) => key + 1);
          }}
        >
          Usar los valores base
        </Button>
      </div>
    </form>
  );
}
