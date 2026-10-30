'use client';

import {
  EXERCISE_BASE_MEASURE_LABELS,
  EXERCISE_BASE_MEASURES,
  EXERCISE_MODALITIES,
  EXERCISE_MODALITY_LABELS,
  FULL_GYM_EQUIPMENT,
  TRAINING_LEVEL_LABELS,
  TRAINING_LEVELS,
  type ExerciseBaseMeasure,
  type ExerciseCatalogResponse,
  type ExerciseDetail,
  type ExerciseModality,
  type ExerciseRef,
  type MovementPatternCode,
  type OwnExerciseRequest,
  type TrainingLevelCode,
} from '@nutricoach/contracts';
import { Button, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { CheckboxField, submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { ExercisePicker } from './exercise-picker';

const NO_EQUIPMENT = 'NONE';

interface OwnExerciseValues {
  readonly name: string;
  /** Otros nombres, separados por comas. */
  readonly aliases: string;
  readonly pattern: MovementPatternCode | '';
  readonly level: TrainingLevelCode | '';
  readonly modality: ExerciseModality;
  readonly equipmentCode: string;
  readonly isUnilateral: boolean;
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly caution: string;
  readonly alternative: ExerciseRef | null;
  readonly easierVariant: ExerciseRef | null;
  readonly harderVariant: ExerciseRef | null;
  readonly baseSets: string;
  readonly baseRepsMin: string;
  readonly baseRepsMax: string;
  readonly baseMeasure: ExerciseBaseMeasure;
  readonly baseRestSeconds: string;
  readonly mediaUrl: string;
  readonly instructions: string;
}

const asText = (value: number | null): string => (value === null ? '' : String(value));

function initialValues(exercise?: ExerciseDetail): OwnExerciseValues {
  return {
    name: exercise?.name ?? '',
    aliases: exercise?.aliases.join(', ') ?? '',
    pattern: exercise?.pattern ?? '',
    level: exercise?.level ?? '',
    modality: exercise?.modality ?? 'STRENGTH',
    equipmentCode: exercise?.equipmentCode ?? NO_EQUIPMENT,
    isUnilateral: exercise?.isUnilateral ?? false,
    primaryMuscles: exercise?.primaryMuscles.map(({ code }) => code) ?? [],
    secondaryMuscles: exercise?.secondaryMuscles.map(({ code }) => code) ?? [],
    caution: exercise?.caution ?? '',
    alternative: exercise?.alternative ?? null,
    easierVariant: exercise?.easierVariant ?? null,
    harderVariant: exercise?.harderVariant ?? null,
    baseSets: asText(exercise?.baseSets ?? null),
    baseRepsMin: asText(exercise?.baseRepsMin ?? null),
    baseRepsMax: asText(exercise?.baseRepsMax ?? null),
    baseMeasure: exercise?.baseMeasure ?? 'REPS',
    baseRestSeconds: asText(exercise?.baseRestSeconds ?? null),
    mediaUrl: exercise?.mediaUrl ?? '',
    instructions: exercise?.instructions ?? '',
  };
}

const wholeOrNull = (text: string): number | null =>
  text.trim() === '' ? null : Number(text.trim());

function requestOf(values: OwnExerciseValues): OwnExerciseRequest {
  return {
    name: values.name.trim(),
    aliases: values.aliases
      .split(',')
      .map((alias) => alias.trim())
      .filter((alias) => alias !== ''),
    pattern: values.pattern as MovementPatternCode,
    level: values.level as TrainingLevelCode,
    modality: values.modality,
    equipmentCode: values.equipmentCode === NO_EQUIPMENT ? null : values.equipmentCode,
    isUnilateral: values.isUnilateral,
    primaryMuscles: [...values.primaryMuscles],
    secondaryMuscles: [...values.secondaryMuscles],
    caution: values.caution.trim() || null,
    alternativeId: values.alternative?.id ?? null,
    easierVariantId: values.easierVariant?.id ?? null,
    harderVariantId: values.harderVariant?.id ?? null,
    baseSets: wholeOrNull(values.baseSets),
    baseRepsMin: wholeOrNull(values.baseRepsMin),
    baseRepsMax: wholeOrNull(values.baseRepsMax),
    baseMeasure: values.baseMeasure,
    baseRestSeconds: wholeOrNull(values.baseRestSeconds),
    mediaUrl: values.mediaUrl.trim() || null,
    instructions: values.instructions.trim() || null,
  };
}

/** Un entero en el rango, o vacío. */
const wholeInRange =
  (min: number, max: number) =>
  (text: string): true | string => {
    if (text.trim() === '') return true;
    const value = Number(text.trim());
    return Number.isInteger(value) && value >= min && value <= max
      ? true
      : `Escribe un número entero de ${String(min)} a ${String(max)}.`;
  };

/**
 * Ejercicio propio de la organización (RF-25, RN-I01). El músculo principal cuenta 1 y el secundario 0.5 (RN-F06): un
 * mismo músculo va en una sola lista. Editar envía la versión leída en If-Match.
 */
export function OwnExerciseForm({
  catalog,
  exercise,
}: {
  catalog: ExerciseCatalogResponse;
  /** Al editar: el ejercicio como se leyó. */
  exercise?: ExerciseDetail;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const form = useForm<OwnExerciseValues>({ defaultValues: initialValues(exercise) });
  const save = useMutation({
    mutationFn: (body: OwnExerciseRequest) =>
      exercise
        ? apiFetch<ExerciseDetail>(`/exercises/${exercise.id}`, {
            method: 'PUT',
            body,
            headers: { 'If-Match': `"${String(exercise.version)}"` },
          })
        : apiFetch<ExerciseDetail>('/exercises', { method: 'POST', body }),
    onSuccess: ({ id }) => {
      router.push(`/panel/biblioteca/ejercicios/${id}`);
      router.refresh();
    },
  });
  const { errors } = form.formState;
  const primary = useWatch({ control: form.control, name: 'primaryMuscles' });
  const secondary = useWatch({ control: form.control, name: 'secondaryMuscles' });
  const regions = [...new Set(catalog.muscles.map(({ region }) => region))];
  const toggle =
    (field: 'primaryMuscles' | 'secondaryMuscles', code: string) => (checked: boolean) => {
      const current = form.getValues(field);
      form.setValue(
        field,
        checked ? [...current, code] : current.filter((muscle) => muscle !== code),
        { shouldValidate: form.formState.isSubmitted },
      );
    };

  return (
    <form
      noValidate
      className="flex max-w-4xl flex-col gap-6"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(requestOf(values));
        }),
      )}
    >
      <FormError
        error={save.error}
        title={exercise ? 'No se pudo guardar el ejercicio' : 'No se pudo crear el ejercicio'}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nombre"
          autoComplete="off"
          error={errors.name?.message}
          {...form.register('name', {
            validate: (text) =>
              text.trim().length >= 2 ? true : 'Escribe el nombre: 2 letras o más.',
          })}
        />
        <TextField
          label="Otros nombres"
          autoComplete="off"
          hint="Separados por comas. También sirven para buscarlo."
          {...form.register('aliases')}
        />
        <Controller
          control={form.control}
          name="pattern"
          rules={{ required: 'Elige el patrón de movimiento.' }}
          render={({ field }) => (
            <Select
              label="Patrón de movimiento"
              value={field.value || undefined}
              onValueChange={field.onChange}
              error={errors.pattern?.message}
              options={catalog.patterns.map(({ code, name }) => ({ value: code, label: name }))}
            />
          )}
        />
        <Controller
          control={form.control}
          name="level"
          rules={{ required: 'Elige el nivel.' }}
          render={({ field }) => (
            <Select
              label="Nivel"
              value={field.value || undefined}
              onValueChange={field.onChange}
              error={errors.level?.message}
              options={TRAINING_LEVELS.map((level) => ({
                value: level,
                label: TRAINING_LEVEL_LABELS[level],
              }))}
            />
          )}
        />
        <Controller
          control={form.control}
          name="modality"
          render={({ field }) => (
            <Select
              label="Modalidad"
              value={field.value}
              onValueChange={field.onChange}
              options={EXERCISE_MODALITIES.map((modality) => ({
                value: modality,
                label: EXERCISE_MODALITY_LABELS[modality],
              }))}
            />
          )}
        />
        <Controller
          control={form.control}
          name="equipmentCode"
          render={({ field }) => (
            <Select
              label="Equipo"
              value={field.value}
              onValueChange={field.onChange}
              options={[
                { value: NO_EQUIPMENT, label: 'Sin equipo definido' },
                ...catalog.equipment
                  .filter(({ code }) => code !== FULL_GYM_EQUIPMENT)
                  .map(({ code, name }) => ({ value: code, label: name })),
              ]}
            />
          )}
        />
        <Controller
          control={form.control}
          name="isUnilateral"
          render={({ field }) => (
            <CheckboxField
              label="Se hace un lado a la vez"
              checked={field.value}
              onChange={(event) => {
                field.onChange(event.target.checked);
              }}
            />
          )}
        />
      </div>

      <Controller
        control={form.control}
        name="primaryMuscles"
        rules={{
          validate: (muscles) =>
            muscles.length > 0 ? true : 'Elige al menos un músculo principal.',
        }}
        render={() => (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg font-semibold">Músculo principal</legend>
            <p className="text-sm text-muted-foreground">
              Cada serie cuenta 1 para este grupo muscular.
            </p>
            {errors.primaryMuscles ? (
              <p role="alert" className="text-sm text-danger-text">
                {errors.primaryMuscles.message}
              </p>
            ) : null}
            {regions.map((region) => (
              <div key={region} className="flex flex-col gap-1">
                <p className="text-sm font-medium">{region}</p>
                <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                  {catalog.muscles
                    .filter((muscle) => muscle.region === region)
                    .map(({ code, name }) => (
                      <CheckboxField
                        key={code}
                        label={name}
                        checked={primary.includes(code)}
                        disabled={secondary.includes(code)}
                        onChange={(event) => {
                          toggle('primaryMuscles', code)(event.target.checked);
                        }}
                      />
                    ))}
                </div>
              </div>
            ))}
          </fieldset>
        )}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-lg font-semibold">Músculo secundario</legend>
        <p className="text-sm text-muted-foreground">
          Cada serie cuenta 0.5 para este grupo muscular. Opcional.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.muscles.map(({ code, name }) => (
            <CheckboxField
              key={code}
              label={`${name} (secundario)`}
              checked={secondary.includes(code)}
              disabled={primary.includes(code)}
              onChange={(event) => {
                toggle('secondaryMuscles', code)(event.target.checked);
              }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">Valores base</legend>
        <p className="text-sm text-muted-foreground">
          Lo que se propone al agregarlo a una sesión. El coach los ajusta en cada programa.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Series"
            inputMode="numeric"
            autoComplete="off"
            error={errors.baseSets?.message}
            {...form.register('baseSets', { validate: wholeInRange(1, 10) })}
          />
          <Controller
            control={form.control}
            name="baseMeasure"
            render={({ field }) => (
              <Select
                label="Medida"
                value={field.value}
                onValueChange={field.onChange}
                options={EXERCISE_BASE_MEASURES.map((measure) => ({
                  value: measure,
                  label: EXERCISE_BASE_MEASURE_LABELS[measure],
                }))}
              />
            )}
          />
          <TextField
            label="Mínimo"
            inputMode="numeric"
            autoComplete="off"
            error={errors.baseRepsMin?.message}
            {...form.register('baseRepsMin', { validate: wholeInRange(1, 600) })}
          />
          <TextField
            label="Máximo"
            inputMode="numeric"
            autoComplete="off"
            error={errors.baseRepsMax?.message}
            {...form.register('baseRepsMax', {
              validate: (text, values) => {
                const range = wholeInRange(1, 600)(text);
                if (range !== true) return range;
                const low = wholeOrNull(values.baseRepsMin);
                const high = wholeOrNull(text);
                return low !== null && high !== null && low > high
                  ? 'El máximo no puede ser menor que el mínimo.'
                  : true;
              },
            })}
          />
          <TextField
            label="Descanso (s)"
            inputMode="numeric"
            autoComplete="off"
            error={errors.baseRestSeconds?.message}
            {...form.register('baseRestSeconds', { validate: wholeInRange(0, 600) })}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">Variantes</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['alternative', 'Alternativa'],
              ['easierVariant', 'Regresión (más fácil)'],
              ['harderVariant', 'Progresión (más difícil)'],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <ExercisePicker
                  label={label}
                  value={field.value}
                  exclude={exercise?.id}
                  onChange={field.onChange}
                />
              )}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4">
        <TextField
          label="Precaución general"
          autoComplete="off"
          hint="Lo que el coach debe mirar antes de indicarlo, sin diagnóstico."
          error={errors.caution?.message}
          {...form.register('caution', {
            validate: (text) => (text.length <= 300 ? true : 'Hasta 300 caracteres.'),
          })}
        />
        <TextField
          label="Enlace al video o la imagen"
          type="url"
          autoComplete="off"
          hint="Empieza con https://."
          error={errors.mediaUrl?.message}
          {...form.register('mediaUrl', {
            validate: (text) =>
              text.trim() === '' || text.trim().startsWith('https://')
                ? true
                : 'El enlace debe empezar con https://.',
          })}
        />
        <TextAreaField
          label="Instrucciones"
          error={errors.instructions?.message}
          {...form.register('instructions', {
            validate: (text) => (text.length <= 2000 ? true : 'Hasta 2000 caracteres.'),
          })}
        />
      </div>

      <div>
        <Button type="submit" disabled={!canWrite || save.isPending}>
          {exercise ? 'Guardar cambios' : 'Crear ejercicio'}
        </Button>
      </div>
    </form>
  );
}
