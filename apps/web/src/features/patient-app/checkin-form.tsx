'use client';

import { formatNumber, READINESS_NOTE, type Checkin, type LogCheckin } from '@nutricoach/contracts';
import { Button, Notice, NumberField } from '@nutricoach/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { FormError } from '@/features/forms/form-error';
import { hasData, parseCheckin, type CheckinField, type CheckinValues } from './checkin';
import { newClientId, useRecord } from './records';
import { ScaleField } from './scale-field';

function MeasureField({
  control,
  name,
  label,
  unit,
  integer = false,
  hint,
  problems,
}: {
  control: Control<CheckinValues>;
  name: CheckinField;
  label: string;
  unit?: 'h' | 'min' | 'lpm' | 'ms' | 'g' | '%' | 'kcal';
  integer?: boolean;
  hint?: string;
  problems: Partial<Record<CheckinField, string>>;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <NumberField
          label={label}
          {...(unit ? { unit } : {})}
          inputMode={integer ? 'numeric' : 'decimal'}
          value={field.value}
          onValueChange={field.onChange}
          hint={problems[name] ? undefined : hint}
          error={problems[name]}
        />
      )}
    />
  );
}

function Scale({
  control,
  name,
  label,
  hint,
  min = 1,
  max = 5,
}: {
  control: Control<CheckinValues>;
  name: CheckinField;
  label: string;
  hint: string;
  min?: number;
  max?: number;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ScaleField
          label={label}
          hint={hint}
          min={min}
          max={max}
          value={field.value}
          onChange={field.onChange}
        />
      )}
    />
  );
}

/**
 * El registro diario de entrenamiento y recuperación (RN-G11, 07 §9), pensado para hacerse en menos de 2 minutos: la sesión, el
 * sueño, cuatro escalas de un toque y la alimentación; lo demás, opcional y plegado. Los síntomas del ciclo solo con la
 * autorización MENSTRUAL_TRACKING (RN-G17). Registrarlo otra vez el mismo día lo corrige (RN-G12). Al guardar vuelve a Hoy,
 * donde está la indicación del día.
 */
export function CheckinForm({
  localDate,
  initial,
  menstrualTracking,
  performanceFromSession,
  correcting,
}: {
  localDate: string;
  initial: CheckinValues;
  menstrualTracking: boolean;
  /** El tonelaje de la sesión registrada hoy frente al prescrito (P-09): entonces el rendimiento sale de ahí. */
  performanceFromSession: { readonly plannedKg: number; readonly loggedKg: number } | null;
  correcting: boolean;
}) {
  const router = useRouter();
  const form = useForm<CheckinValues>({ defaultValues: initial });
  const [problems, setProblems] = useState<Partial<Record<CheckinField, string>>>({});
  const record = useRecord<LogCheckin, Checkin>('/me/checkins');
  const values = useWatch({ control: form.control });

  const onSubmit = form.handleSubmit((submitted) => {
    const parsed = parseCheckin(
      submitted,
      { clientId: newClientId(), localDate },
      menstrualTracking,
    );
    setProblems(parsed.ok ? {} : parsed.problems);
    if (!parsed.ok) return;
    record.mutate(parsed.body, {
      onSuccess: () => {
        router.push('/mi/hoy');
      },
    });
  });

  return (
    <form
      noValidate
      aria-label="Registro diario"
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <Notice tone="info" title="Para qué se usa">
        {READINESS_NOTE}
      </Notice>

      <fieldset className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <legend className="px-1 font-semibold">Tu sesión de hoy</legend>
        <div className="grid grid-cols-2 gap-3">
          <MeasureField
            control={form.control}
            name="sessionMinutes"
            label="Duración"
            unit="min"
            integer
            hint="0 si hoy no entrenaste."
            problems={problems}
          />
          <MeasureField
            control={form.control}
            name="sessionRpe"
            label="RPE de la sesión"
            hint="Esfuerzo de toda la sesión, de 0 a 10."
            problems={problems}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <legend className="px-1 font-semibold">Cómo te recuperas</legend>
        <MeasureField
          control={form.control}
          name="sleepHours"
          label="Sueño de anoche"
          unit="h"
          hint="En medias horas: 7 o 7.5."
          problems={problems}
        />
        <Scale control={form.control} name="fatigue" label="Fatiga" hint="1 nada · 5 mucha" />
        <Scale
          control={form.control}
          name="soreness"
          label="Dolor muscular"
          hint="1 nada · 5 mucho"
        />
        <Scale control={form.control} name="stress" label="Estrés" hint="1 nada · 5 mucho" />
        <Scale
          control={form.control}
          name="motivation"
          label="Motivación"
          hint="1 poca · 5 mucha"
        />
        {menstrualTracking ? (
          <Scale
            control={form.control}
            name="menstrualSymptoms"
            label="Síntomas del ciclo"
            hint="De 0, sin síntomas, a 3."
            min={0}
            max={3}
          />
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <legend className="px-1 font-semibold">Tu alimentación</legend>
        <MeasureField
          control={form.control}
          name="nutritionCompliancePct"
          label="Cuánto de tu plan cumpliste"
          unit="%"
          integer
          problems={problems}
        />
      </fieldset>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="flex min-h-touch cursor-pointer items-center font-semibold">
          Más datos, si los tienes
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <MeasureField
            control={form.control}
            name="carbsAroundTrainingG"
            label="Carbohidratos alrededor del entrenamiento"
            unit="g"
            problems={problems}
          />
          {performanceFromSession ? (
            <p className="text-sm text-muted-foreground">
              Tu rendimiento sale de la sesión que registraste:{' '}
              {formatNumber(performanceFromSession.loggedKg, 'trainingLoad')} kg de{' '}
              {formatNumber(performanceFromSession.plannedKg, 'trainingLoad')} kg planificados.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <MeasureField
                control={form.control}
                name="performancePlanned"
                label="Rendimiento planificado"
                hint="Lo que te tocaba, como te lo indicó tu coach."
                problems={problems}
              />
              <MeasureField
                control={form.control}
                name="performanceActual"
                label="Rendimiento real"
                hint="Lo que lograste, en la misma medida."
                problems={problems}
              />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Del reloj o del celular, a mano. Si no los tienes, no pasa nada.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <MeasureField
              control={form.control}
              name="restingHrBpm"
              label="FC en reposo"
              unit="lpm"
              integer
              problems={problems}
            />
            <MeasureField
              control={form.control}
              name="hrvMs"
              label="HRV"
              unit="ms"
              problems={problems}
            />
            <MeasureField
              control={form.control}
              name="steps"
              label="Pasos"
              integer
              problems={problems}
            />
            <MeasureField
              control={form.control}
              name="activeKcal"
              label="Calorías activas"
              unit="kcal"
              problems={problems}
            />
          </div>
        </div>
      </details>

      {Object.keys(problems).length > 0 ? (
        <Notice tone="danger" title="Revisa los datos marcados">
          El registro no se guardó.
        </Notice>
      ) : null}
      <FormError error={record.error} title="No se guardó el registro diario" />
      <Button
        type="submit"
        size="touch"
        disabled={!hasData(values) || record.isPending || record.isSuccess}
      >
        {record.isPending ? 'Guardando…' : correcting ? 'Guardar los cambios' : 'Guardar registro'}
      </Button>
    </form>
  );
}
