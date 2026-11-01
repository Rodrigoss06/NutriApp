'use client';

import {
  ONE_RM_FORMULA_LABELS,
  ONE_RM_FORMULAS,
  PROGRAM_ORIGIN_LABELS,
  ROUTINE_SPLIT_LABELS,
  TRAINING_LEVEL_LABELS,
  TRAINING_OBJECTIVE_LABELS,
  type OneRmFormula,
  type ProgramDetail,
  type UpdateProgram,
} from '@nutricoach/contracts';
import { Button, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { DownloadSheetButton } from '@/features/documents/download-sheet-button';
import { submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { PLAN_STATUS_LABELS, PLAN_STATUS_TONES } from '@/features/nutrition-plan/labels';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';
import { formatDate } from '@/lib/dates';
import type { ProgramEditor as Editor } from './use-program';

interface HeaderValues {
  readonly name: string;
  readonly goal: string;
  readonly startDate: string;
  readonly oneRmFormula: OneRmFormula;
}

const valuesOf = (program: ProgramDetail): HeaderValues => ({
  name: program.name,
  goal: program.goal ?? '',
  startDate: program.startDate ?? '',
  oneRmFormula: program.oneRmFormula,
});

function HeaderForm({
  program,
  formulaFixed,
  write,
}: {
  program: ProgramDetail;
  formulaFixed: boolean;
  write: Editor['write'];
}) {
  const form = useForm<HeaderValues>({ defaultValues: valuesOf(program) });
  const save = useMutation({
    mutationFn: (body: UpdateProgram) => write('', { method: 'PATCH', body }),
    onSuccess: (next) => {
      form.reset(valuesOf(next));
    },
  });
  return (
    <details>
      <summary className="cursor-pointer py-2 text-sm font-medium">
        Editar los datos del programa
      </summary>
      <form
        noValidate
        aria-label="Datos del programa"
        className="flex flex-col gap-3 pt-2"
        onSubmit={submitWith(
          form.handleSubmit((values) => {
            save.mutate({
              name: values.name,
              goal: values.goal.trim() || null,
              startDate: values.startDate || null,
              ...(formulaFixed ? {} : { oneRmFormula: values.oneRmFormula }),
            });
          }),
        )}
      >
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <TextField
            label="Nombre"
            maxLength={120}
            autoComplete="off"
            error={form.formState.errors.name?.message}
            {...form.register('name', {
              validate: (value) => value.trim() !== '' || 'Escribe el nombre del programa.',
            })}
          />
          <TextField
            label="Fecha de inicio"
            type="date"
            hint="Si queda vacía, empieza el día que se publique."
            {...form.register('startDate')}
          />
          {formulaFixed ? null : (
            <Controller
              control={form.control}
              name="oneRmFormula"
              render={({ field }) => (
                <Select
                  label="Fórmula de 1RM"
                  hint="Es siempre la misma para esta persona (RN-F04)."
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ONE_RM_FORMULAS.map((code) => ({
                    value: code,
                    label: ONE_RM_FORMULA_LABELS[code],
                  }))}
                />
              )}
            />
          )}
          <div className="sm:col-span-2">
            <TextAreaField
              label="Objetivo del programa"
              rows={2}
              maxLength={500}
              className="min-h-16"
              {...form.register('goal')}
            />
          </div>
        </div>
        <FormError error={save.error} title="No se guardaron los datos" />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            disabled={!form.formState.isDirty || save.isPending}
          >
            {save.isPending ? 'Guardando…' : 'Guardar datos'}
          </Button>
          {save.isSuccess && !form.formState.isDirty ? (
            <span role="status" className="text-sm">
              Datos guardados.
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

/**
 * La versión siguiente de un programa publicado (RN-F12): un borrador con lo mismo. Si la rutina ya tiene un borrador, la API responde 409
 * con su id y se abre ese.
 */
function ReviseProgramButton({ program, base }: { program: ProgramDetail; base: string }) {
  const router = useRouter();
  const open = (id: string) => {
    router.push(`${base}/${id}`);
  };
  const revise = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/training-programs/${program.id}/revise`, { method: 'POST' }),
    onSuccess: ({ id }) => {
      open(id);
    },
    onError: (error) => {
      const draftId = error instanceof ApiError ? error.problem.details?.['draftId'] : undefined;
      if (error instanceof ApiError && error.code === 'NC-TRA-012' && typeof draftId === 'string') {
        open(draftId);
      }
    },
  });
  const pendingDraft = revise.error instanceof ApiError && revise.error.code === 'NC-TRA-012';
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          disabled={revise.isPending}
          onClick={() => {
            revise.mutate();
          }}
        >
          {revise.isPending ? 'Creando…' : 'Crear versión nueva'}
        </Button>
      </div>
      {pendingDraft ? null : <FormError error={revise.error} title="No se creó la versión" />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

/**
 * El programa en una mirada: de dónde salió, cuándo vale y qué fórmula de 1RM usa (RF-26, RN-F04). Publicado, su ficha en PDF (RN-H01):
 * descargarla vale también en solo lectura (RN-A02).
 */
export function ProgramHeader({
  program,
  editable,
  canRevise,
  formulaFixed,
  write,
  base,
}: {
  program: ProgramDetail;
  /** Es un borrador y se puede editar. */
  editable: boolean;
  canRevise: boolean;
  formulaFixed: boolean;
  write: Editor['write'];
  base: string;
}) {
  return (
    <section
      aria-labelledby="programa-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="programa-titulo" className="text-lg font-semibold">
          {program.name}
        </h2>
        <StatusBadge tone={PLAN_STATUS_TONES[program.status]}>
          {PLAN_STATUS_LABELS[program.status]}
        </StatusBadge>
      </div>
      {program.goal ? <p className="text-sm whitespace-pre-wrap">{program.goal}</p> : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Fact label="Versión" value={String(program.versionNo)} />
        <Fact label="Origen" value={PROGRAM_ORIGIN_LABELS[program.origin]} />
        {program.objective ? (
          <Fact label="Objetivo" value={TRAINING_OBJECTIVE_LABELS[program.objective]} />
        ) : null}
        {program.level ? <Fact label="Nivel" value={TRAINING_LEVEL_LABELS[program.level]} /> : null}
        {program.daysPerWeek ? (
          <Fact label="Días por semana" value={String(program.daysPerWeek)} />
        ) : null}
        {program.split ? (
          <Fact label="División" value={ROUTINE_SPLIT_LABELS[program.split]} />
        ) : null}
        {program.document.totalWeeks > 0 ? (
          <Fact label="Semanas" value={String(program.document.totalWeeks)} />
        ) : null}
        <Fact
          label="Inicio"
          value={program.startDate ? formatDate(program.startDate) : 'Al publicar'}
        />
        {program.endDate ? <Fact label="Fin" value={formatDate(program.endDate)} /> : null}
        <Fact label="Fórmula de 1RM" value={ONE_RM_FORMULA_LABELS[program.oneRmFormula]} />
      </dl>
      {editable ? <HeaderForm program={program} formulaFixed={formulaFixed} write={write} /> : null}
      {program.status === 'DRAFT' ? null : (
        <div className="flex flex-wrap items-start gap-3">
          {canRevise ? <ReviseProgramButton program={program} base={base} /> : null}
          <DownloadSheetButton
            patientId={program.patientId}
            source={{ sourceType: 'TRAINING_PROGRAM', sourceId: program.id }}
          />
        </div>
      )}
    </section>
  );
}
