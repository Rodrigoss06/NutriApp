'use client';

import {
  MEDICAL_CLEARANCE_CODES,
  MEDICAL_CLEARANCE_LABELS,
  TRAINING_LEVEL_LABELS,
  TRAINING_LEVELS,
  TRAINING_OBJECTIVE_CODES,
  TRAINING_OBJECTIVE_LABELS,
  type AthleteProfile,
  type CareTeamMember,
  type ExerciseCatalogResponse,
  type FunctionalCatalogResponse,
  type MemberResponse,
  type SaveAthleteProfile,
} from '@nutricoach/contracts';
import { Button, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { CheckboxField, submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { CareTeamNotice } from '@/features/patients/record-write-gate';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';
import { formatInstant } from '@/lib/dates';
import {
  parseProfile,
  PROFILE_HINTS,
  valuesOf,
  type ProfileProblems,
  type ProfileValues,
} from './athlete-profile-values';
import { useEditsRecord } from './use-edits-record';

const REVISION_CONFLICT = 'NC-TRA-001';
const DAYS = ['2', '3', '4', '5'] as const;
const WEEKS = ['8', '9', '10', '11', '12'] as const;

const optionsOf = (labels: Readonly<Record<string, string>>, codes: readonly string[]) =>
  codes.map((code) => ({ value: code, label: labels[code] ?? code }));

/**
 * El perfil de entrenamiento (07 §2): lo que controla la propuesta y el macrociclo, y dos de las llaves (RN-F15). Cada
 * guardado es una revisión nueva. Si alguien guardó antes (409), lo escrito no se borra: se vuelve a guardar sobre lo último.
 */
export function AthleteProfileForm({
  patientId,
  current,
  equipment,
  physicalTests,
  careTeam,
  members,
  archived,
}: {
  patientId: string;
  current: AthleteProfile | null;
  equipment: ExerciseCatalogResponse['equipment'];
  physicalTests: FunctionalCatalogResponse['physicalTests'];
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const router = useRouter();
  const { timezone } = usePanelSession();
  const editable = useEditsRecord(careTeam, members, archived);
  const writes = useWritesRecord(careTeam, members);
  const [revision, setRevision] = useState(current?.revision ?? 0);
  const [problems, setProblems] = useState<ProfileProblems>({});
  const form = useForm<ProfileValues>({ defaultValues: valuesOf(current) });
  const save = useMutation({
    mutationFn: (body: SaveAthleteProfile) =>
      apiFetch<{ revision: number }>(`/patients/${patientId}/athlete-profile`, {
        method: 'PUT',
        body,
      }),
    onSuccess: (saved) => {
      setRevision(saved.revision);
      form.reset(form.getValues());
      router.refresh();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === REVISION_CONFLICT) {
        const latest = await apiFetch<{ current: AthleteProfile | null }>(
          `/patients/${patientId}/athlete-profile`,
        );
        setRevision(latest.current?.revision ?? 0);
      }
    },
  });
  const onSubmit = (values: ProfileValues) => {
    const parsed = parseProfile(values, revision);
    setProblems(parsed.ok ? {} : parsed.problems);
    if (parsed.ok) save.mutate(parsed.body);
  };
  const disabled = !editable;
  const conflict = save.error instanceof ApiError && save.error.code === REVISION_CONFLICT;
  const hasProblems = Object.keys(problems).length > 0;

  return (
    <form
      noValidate
      aria-label="Perfil de entrenamiento"
      className="flex flex-col gap-6"
      onSubmit={submitWith(form.handleSubmit(onSubmit))}
    >
      {current ? (
        <p className="text-sm text-muted-foreground">
          Revisión {current.revision}, guardada el {formatInstant(current.recordedAt, timezone)}.
        </p>
      ) : null}
      {writes ? null : <CareTeamNotice patientId={patientId} action="editar el perfil" />}
      <fieldset
        disabled={disabled}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      >
        <legend className="px-1 font-medium">Prescripción</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="objective"
            render={({ field }) => (
              <Select
                label="Objetivo"
                placeholder="Elige uno"
                value={field.value || undefined}
                disabled={disabled}
                error={problems.objective}
                onValueChange={field.onChange}
                options={optionsOf(TRAINING_OBJECTIVE_LABELS, TRAINING_OBJECTIVE_CODES)}
              />
            )}
          />
          <Controller
            control={form.control}
            name="level"
            render={({ field }) => (
              <Select
                label="Nivel"
                placeholder="Elige uno"
                value={field.value || undefined}
                disabled={disabled}
                error={problems.level}
                onValueChange={field.onChange}
                options={optionsOf(TRAINING_LEVEL_LABELS, TRAINING_LEVELS)}
              />
            )}
          />
          <Controller
            control={form.control}
            name="daysPerWeek"
            render={({ field }) => (
              <Select
                label="Días por semana"
                placeholder="Elige uno"
                value={field.value || undefined}
                disabled={disabled}
                error={problems.daysPerWeek}
                onValueChange={field.onChange}
                options={DAYS.map((days) => ({ value: days, label: days }))}
              />
            )}
          />
          <Controller
            control={form.control}
            name="macrocycleWeeks"
            render={({ field }) => (
              <Select
                label="Semanas del macrociclo"
                value={field.value}
                disabled={disabled}
                onValueChange={field.onChange}
                options={WEEKS.map((weeks) => ({ value: weeks, label: weeks }))}
              />
            )}
          />
          <TextField
            label="Minutos por sesión"
            inputMode="numeric"
            autoComplete="off"
            hint={problems.minutesPerSession ? undefined : PROFILE_HINTS.minutesPerSession}
            error={problems.minutesPerSession}
            {...form.register('minutesPerSession')}
          />
          <TextField label="Fecha de inicio" type="date" {...form.register('startDate')} />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Equipamiento disponible</legend>
          <div className="grid sm:grid-cols-2">
            {equipment.map((item) => (
              <CheckboxField
                key={item.code}
                label={item.name}
                value={item.code}
                {...form.register('equipmentCodes')}
              />
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset
        disabled={disabled}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      >
        <legend className="px-1 font-medium">Seguridad</legend>
        <p className="text-sm text-muted-foreground">
          El alta pendiente y los síntomas de alarma detienen la propuesta hasta que se resuelvan
          (RN-F15). No es un diagnóstico.
        </p>
        <Controller
          control={form.control}
          name="medicalClearance"
          render={({ field }) => (
            <Select
              label="Alta médica"
              value={field.value}
              disabled={disabled}
              onValueChange={field.onChange}
              options={optionsOf(MEDICAL_CLEARANCE_LABELS, MEDICAL_CLEARANCE_CODES)}
            />
          )}
        />
        <CheckboxField
          label="Síntomas de alarma: neurológicos o mareos"
          {...form.register('alarmSymptoms')}
        />
        <TextAreaField
          label="Lesiones"
          hint="Lo que refiere la persona, sin diagnóstico."
          maxLength={2_000}
          {...form.register('injuriesNote')}
        />
        <TextAreaField
          label="Restricciones de movimientos o cargas"
          maxLength={2_000}
          {...form.register('restrictionsNote')}
        />
      </fieldset>

      <fieldset
        disabled={disabled}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      >
        <legend className="px-1 font-medium">Línea base</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Peso inicial (kg)"
            inputMode="decimal"
            autoComplete="off"
            hint={problems.baselineWeightKg ? undefined : PROFILE_HINTS.baselineWeightKg}
            error={problems.baselineWeightKg}
            {...form.register('baselineWeightKg')}
          />
          <TextField
            label="Frecuencia cardíaca en reposo (lpm)"
            inputMode="numeric"
            autoComplete="off"
            hint={problems.baselineRestingHrBpm ? undefined : PROFILE_HINTS.baselineRestingHrBpm}
            error={problems.baselineRestingHrBpm}
            {...form.register('baselineRestingHrBpm')}
          />
          <TextField
            label="Variabilidad de la frecuencia cardíaca (ms)"
            inputMode="decimal"
            autoComplete="off"
            hint={problems.baselineHrvMs ? undefined : PROFILE_HINTS.baselineHrvMs}
            error={problems.baselineHrvMs}
            {...form.register('baselineHrvMs')}
          />
          <TextField
            label="Sueño objetivo (horas)"
            inputMode="decimal"
            autoComplete="off"
            hint={problems.sleepTargetHours ? undefined : PROFILE_HINTS.sleepTargetHours}
            error={problems.sleepTargetHours}
            {...form.register('sleepTargetHours')}
          />
        </div>
      </fieldset>

      <fieldset
        disabled={disabled}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      >
        <legend className="px-1 font-medium">Objetivos de las pruebas físicas</legend>
        <p className="text-sm text-muted-foreground">
          {problems.testTargets ?? 'Opcionales. Se muestran junto a cada prueba.'}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {physicalTests.map((test) => (
            <TextField
              key={test.code}
              label={`${test.name} (${test.unit})`}
              inputMode="decimal"
              autoComplete="off"
              {...form.register(`testTargets.${test.code}`)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="rounded-lg border border-border bg-card p-4">
        <legend className="px-1 font-medium">Notas</legend>
        <TextAreaField label="Notas del coach" maxLength={2_000} {...form.register('notes')} />
      </fieldset>

      {hasProblems ? (
        <Notice tone="danger" title="Revisa los datos marcados">
          El perfil no se guardó.
        </Notice>
      ) : null}
      {conflict ? (
        <Notice tone="warning" title="Alguien guardó el perfil mientras lo editabas">
          Lo que escribiste sigue aquí. Revísalo y vuelve a guardar para crear la revisión
          siguiente.
        </Notice>
      ) : (
        <FormError error={save.error} title="No se pudo guardar el perfil" />
      )}
      {save.isSuccess && !form.formState.isDirty ? (
        <Notice tone="success" title={`Perfil guardado: revisión ${String(revision)}`} />
      ) : null}
      {editable ? (
        <div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar perfil'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
