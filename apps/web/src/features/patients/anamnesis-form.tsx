'use client';

import {
  ANAMNESIS_MODALITIES,
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_SECTIONS,
  type AnamnesisQuestion,
  type CareTeamMember,
  type ClinicalHistoryResponse,
  type MemberResponse,
} from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';
import { submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';
import { formatInstant } from '@/lib/dates';
import {
  answersOf,
  answerText,
  numberProblem,
  valuesOf,
  type AnamnesisValues,
} from './anamnesis-values';

type Current = ClinicalHistoryResponse['current'];

const REVISION_CONFLICT = 'NC-CLI-019';
const SCALE_POINTS = ['1', '2', '3', '4', '5'] as const;

const v2Answers = (current: Current) =>
  current?.formCode === 'JV_ANAMNESIS' ? current.answers : null;

/** Una elección con botones de opción: se puede quitar, porque una respuesta puede quedar vacía (RN-F16). */
function ChoiceField({
  label,
  hint,
  options,
  disabled,
  registration,
  onClear,
}: {
  label: string;
  hint?: ReactNode;
  options: readonly { readonly value: string; readonly label: string }[];
  disabled: boolean;
  registration: UseFormRegisterReturn;
  /** Solo si ya está respondida. */
  onClear?: (() => void) | undefined;
}) {
  const hintId = useId();
  return (
    <fieldset
      className="flex flex-col gap-1"
      disabled={disabled}
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-4">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-touch items-center gap-2">
            <input
              type="radio"
              value={option.value}
              className="size-5 accent-brand"
              {...registration}
            />
            {option.label}
          </label>
        ))}
        {onClear ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Quitar respuesta: ${label}`}
            onClick={onClear}
          >
            Quitar
          </Button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Anamnesis integral de JV Fitness (RF-43, 07 §12), presencial u online. Se guarda aunque falten respuestas, y cada
 * guardado es una revisión nueva sobre la que se editó, con su perfil de rendimiento (RN-F16). Si alguien guardó antes
 * (409), lo escrito no se borra: se carga la versión actual para compararla y se vuelve a guardar sobre ella. Sin
 * HEALTH_DATA vigente, la API responde 422 con RN-B01. La escribe solo el equipo de atención con acceso WRITE (RN-A05):
 * para los demás queda de solo lectura; decide la API.
 */
export function AnamnesisForm({
  patientId,
  history,
  members,
  careTeam,
  archived,
}: {
  patientId: string;
  history: ClinicalHistoryResponse;
  members: readonly MemberResponse[];
  careTeam: readonly CareTeamMember[];
  archived: boolean;
}) {
  const router = useRouter();
  const { timezone, userId } = usePanelSession();
  const memberId = members.find((m) => m.userId === userId)?.id;
  const writesRecord = careTeam.some((m) => m.memberId === memberId && m.access === 'WRITE');
  const canWrite = useCanWrite() && !archived && writesRecord;
  const names = new Map(members.map((m) => [m.userId, m.displayName]));
  const [expectedRevision, setExpectedRevision] = useState(history.current?.revision ?? 0);
  const [latest, setLatest] = useState<Current>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const form = useForm<AnamnesisValues>({ defaultValues: valuesOf(v2Answers(history.current)) });
  const typed = useWatch({ control: form.control });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (values: AnamnesisValues) =>
      apiFetch<{ revision: number }>(`/patients/${patientId}/clinical-history`, {
        method: 'PUT',
        body: { expectedRevision, answers: answersOf(values) },
      }),
    onMutate: () => {
      setSaved(null);
    },
    onSuccess: ({ revision }) => {
      setExpectedRevision(revision);
      setSaved(revision);
      setConflict(false);
      setLatest(null);
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === REVISION_CONFLICT) setConflict(true);
    },
  });
  const load = useMutation({
    mutationFn: () => apiFetch<ClinicalHistoryResponse>(`/patients/${patientId}/clinical-history`),
    onSuccess: (data) => {
      setLatest(data.current);
      setExpectedRevision(data.current?.revision ?? 0);
      setConflict(false);
      save.reset();
    },
  });

  const field = (question: AnamnesisQuestion) => {
    const { code, label, hint } = question;
    const answered = (typed[code] ?? '') !== '';
    const onClear =
      answered && canWrite
        ? () => {
            form.setValue(code, '', { shouldDirty: true });
          }
        : undefined;
    switch (question.kind) {
      case 'SCALE':
        return (
          <ChoiceField
            label={label}
            hint={`1 = ${question.low} · 5 = ${question.high}`}
            options={SCALE_POINTS.map((point) => ({ value: point, label: point }))}
            disabled={!canWrite}
            registration={form.register(code)}
            onClear={onClear}
          />
        );
      case 'OPTIONS':
        return (
          <ChoiceField
            label={label}
            hint={hint}
            options={Object.entries(question.options).map(([value, text]) => ({
              value,
              label: text,
            }))}
            disabled={!canWrite}
            registration={form.register(code)}
            onClear={onClear}
          />
        );
      case 'NUMBER':
        return (
          <TextField
            label={label}
            hint={hint}
            inputMode={question.integer ? 'numeric' : 'decimal'}
            autoComplete="off"
            disabled={!canWrite}
            error={errors[code]?.message}
            {...form.register(code, { validate: (text) => numberProblem(question, text) })}
          />
        );
      case 'TEXT':
        return question.long ? (
          <TextAreaField
            label={label}
            hint={hint}
            maxLength={question.maxLength}
            disabled={!canWrite}
            {...form.register(code)}
          />
        ) : (
          <TextField
            label={label}
            hint={hint}
            maxLength={question.maxLength}
            disabled={!canWrite}
            {...form.register(code)}
          />
        );
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(values);
        }),
      )}
    >
      {writesRecord ? null : (
        <Notice tone="info" title="Solo lectura">
          La anamnesis la escribe el equipo de atención con permiso de escritura. El equipo se edita
          en la{' '}
          <Link href={`/panel/pacientes/${patientId}`} className="underline">
            Ficha
          </Link>
          .
        </Notice>
      )}
      {conflict ? (
        <Notice tone="warning" title="Alguien guardó la historia mientras la editabas">
          <span className="flex flex-col gap-2">
            Lo que escribiste sigue aquí. Carga la versión actual para compararla y vuelve a
            guardar.
            <span>
              <Button
                variant="secondary"
                size="sm"
                disabled={load.isPending}
                onClick={() => {
                  load.mutate();
                }}
              >
                Cargar la versión actual
              </Button>
            </span>
          </span>
        </Notice>
      ) : (
        <FormError error={save.error} title="No se guardó la anamnesis" />
      )}
      <FormError error={load.error} title="No pudimos cargar la versión actual" />
      {latest ? (
        <Notice tone="info" title={`Versión actual: revisión ${String(latest.revision)}`}>
          Guardada el {formatInstant(latest.recordedAt, timezone)} por{' '}
          {names.get(latest.recordedBy) ?? 'otra persona'}. Debajo de cada pregunta que cambió verás
          su respuesta; al guardar, tu versión queda como la revisión siguiente.
        </Notice>
      ) : null}
      {saved ? <Notice tone="success" title={`Revisión ${String(saved)} guardada`} /> : null}
      <ChoiceField
        label="Modalidad"
        options={ANAMNESIS_MODALITIES.map((value) => ({
          value,
          label: ANAMNESIS_MODALITY_LABELS[value],
        }))}
        disabled={!canWrite}
        registration={form.register('modality')}
      />
      {ANAMNESIS_SECTIONS.map((section) => (
        <fieldset key={section.title} className="flex flex-col gap-4 border-t border-border pt-4">
          <legend className="pr-2 font-semibold">{section.title}</legend>
          <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
            {section.questions.map((question) => {
              const theirs = latest === null ? null : (v2Answers(latest)?.[question.code] ?? '');
              const differs = theirs !== null && String(theirs) !== (typed[question.code] ?? '');
              return (
                <div key={question.code} className="flex flex-col gap-2">
                  {field(question)}
                  {differs ? (
                    <div className="rounded-md bg-surface p-3 text-sm">
                      <p className="font-medium">En la revisión {latest?.revision}:</p>
                      <p className="whitespace-pre-wrap">{answerText(question, theirs)}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      {writesRecord ? (
        <div>
          <Button type="submit" disabled={!canWrite || save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar anamnesis'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
