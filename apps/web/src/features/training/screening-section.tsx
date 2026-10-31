'use client';

import {
  SCREENING_DECISION_CODES,
  SCREENING_DECISION_LABELS,
  SCREENING_DETAIL_LABEL,
  SCREENING_QUESTIONS,
  SCREENING_STATUS_LABELS,
  type CareTeamMember,
  type MemberResponse,
  type RecordScreening,
  type ReviewScreening,
  type Screening,
} from '@nutricoach/contracts';
import { Button, FieldMessages, Notice, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { Controller, useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { submitWith, TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { SCREENING_STATUS_TONES } from './labels';
import { useEditsRecord } from './use-edits-record';

type QuestionCode = (typeof SCREENING_QUESTIONS)[number]['code'];
type AnswerValues = Record<QuestionCode, 'YES' | 'NO' | ''> & { S09: string };

const EMPTY_ANSWERS = {
  S01: '',
  S02: '',
  S03: '',
  S04: '',
  S05: '',
  S06: '',
  S07: '',
  S08: '',
  S09: '',
} as const satisfies AnswerValues;

function YesNoField({
  label,
  error,
  disabled,
  registration,
}: {
  label: string;
  error?: string | undefined;
  disabled: boolean;
  registration: UseFormRegisterReturn;
}) {
  const id = useId();
  return (
    <fieldset
      className="flex flex-col gap-1"
      disabled={disabled}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-4">
        {(
          [
            ['YES', 'Sí'],
            ['NO', 'No'],
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="flex min-h-touch items-center gap-2">
            <input type="radio" value={value} className="size-5 accent-brand" {...registration} />
            {text}
          </label>
        ))}
      </div>
      <FieldMessages id={id} error={error} />
    </fieldset>
  );
}

/** La decisión del coach sobre un cribado en rojo o ámbar: se guarda una sola vez, con su nota (RN-F15). */
function ReviewForm({ patientId, screeningId }: { patientId: string; screeningId: string }) {
  const router = useRouter();
  const form = useForm<{ decision: string; note: string }>({
    defaultValues: { decision: '', note: '' },
  });
  const review = useMutation({
    mutationFn: (body: ReviewScreening) =>
      apiFetch(`/patients/${patientId}/screenings/${screeningId}/review`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  return (
    <form
      noValidate
      aria-label="Revisar este cribado"
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          review.mutate({
            decision: values.decision as ReviewScreening['decision'],
            note: values.note,
          });
        }),
      )}
    >
      <Controller
        control={form.control}
        name="decision"
        rules={{ required: 'Elige una decisión.' }}
        render={({ field, fieldState }) => (
          <Select
            label="Decisión"
            placeholder="Elige una"
            value={field.value || undefined}
            error={fieldState.error?.message}
            onValueChange={field.onChange}
            options={SCREENING_DECISION_CODES.map((code) => ({
              value: code,
              label: SCREENING_DECISION_LABELS[code],
            }))}
          />
        )}
      />
      <TextAreaField
        label="Nota de la revisión"
        hint="Se guarda una sola vez. Si cambia la situación, registra un cribado nuevo."
        maxLength={2_000}
        error={form.formState.errors.note?.message}
        {...form.register('note', {
          validate: (value) => value.trim() !== '' || 'Escribe la nota de la revisión.',
        })}
      />
      <FormError error={review.error} title="No se pudo guardar la revisión" />
      <div>
        <Button type="submit" disabled={review.isPending}>
          {review.isPending ? 'Guardando…' : 'Guardar revisión'}
        </Button>
      </div>
    </form>
  );
}

function ScreeningItem({
  patientId,
  screening,
  editable,
  isLatest,
  members,
}: {
  patientId: string;
  screening: Screening;
  editable: boolean;
  isLatest: boolean;
  members: readonly MemberResponse[];
}) {
  const { timezone } = usePanelSession();
  const yes = SCREENING_QUESTIONS.filter(({ code }) => screening.answers[code]);
  const answeredBy = members.find((m) => m.userId === screening.answeredBy)?.displayName;
  const reviewedBy = members.find((m) => m.id === screening.review?.reviewedBy)?.displayName;
  const pending = screening.status !== 'GREEN' && !screening.review;
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={SCREENING_STATUS_TONES[screening.status]}>
          {SCREENING_STATUS_LABELS[screening.status]}
        </StatusBadge>
        <span className="text-sm">{formatInstant(screening.answeredAt, timezone)}</span>
        {answeredBy ? (
          <span className="text-sm text-muted-foreground">Registró: {answeredBy}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Formulario {screening.formVersion} · reglas {screening.ruleVersion}
      </p>
      {yes.length === 0 ? (
        <p className="text-sm">Todas las respuestas son No.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Respondió Sí a:</p>
          <ul className="list-disc pl-5 text-sm">
            {yes.map(({ code, label }) => (
              <li key={code}>{label}</li>
            ))}
          </ul>
        </div>
      )}
      {screening.answers.S09 ? (
        <p className="text-sm whitespace-pre-wrap">Detalle: {screening.answers.S09}</p>
      ) : null}
      {screening.review ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">
              Revisión: {SCREENING_DECISION_LABELS[screening.review.decision]}
            </span>
            {' · '}
            {reviewedBy ?? 'Equipo de atención'} ·{' '}
            {formatInstant(screening.review.reviewedAt, timezone)}
          </p>
          <p className="whitespace-pre-wrap">{screening.review.note}</p>
        </div>
      ) : null}
      {pending && isLatest && editable ? (
        <ReviewForm patientId={patientId} screeningId={screening.id} />
      ) : null}
      {pending && !isLatest ? (
        <p className="text-sm text-muted-foreground">Sin revisar. Manda el cribado más reciente.</p>
      ) : null}
    </li>
  );
}

/**
 * El cribado previo al ejercicio (RN-F15, 07 §3.2), con su historial: cada respuesta es una fila nueva y el motor decide el
 * estado. En rojo o ámbar, el coach decide si inicia, limita o deriva. Por ahora lo registra el equipo en consulta.
 */
export function ScreeningSection({
  patientId,
  screenings,
  careTeam,
  members,
  archived,
}: {
  patientId: string;
  screenings: readonly Screening[];
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const router = useRouter();
  const editable = useEditsRecord(careTeam, members, archived);
  const form = useForm<AnswerValues>({ defaultValues: EMPTY_ANSWERS });
  const record = useMutation({
    mutationFn: (body: RecordScreening) =>
      apiFetch<{ id: string }>(`/patients/${patientId}/screenings`, { method: 'POST', body }),
    onSuccess: () => {
      form.reset(EMPTY_ANSWERS);
      router.refresh();
    },
  });
  const onSubmit = (values: AnswerValues) => {
    record.mutate({
      answers: {
        S01: values.S01 === 'YES',
        S02: values.S02 === 'YES',
        S03: values.S03 === 'YES',
        S04: values.S04 === 'YES',
        S05: values.S05 === 'YES',
        S06: values.S06 === 'YES',
        S07: values.S07 === 'YES',
        S08: values.S08 === 'YES',
        ...(values.S09.trim() ? { S09: values.S09 } : {}),
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Notice tone="info" title="Una respuesta afirmativa no equivale por sí sola a un diagnóstico">
        Solo detiene la propuesta hasta que el coach decide si inicia, limita o deriva.
      </Notice>
      {screenings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay cribados registrados.</p>
      ) : (
        <ul
          aria-label="Cribados registrados"
          className="divide-y divide-border rounded-lg border border-border bg-card"
        >
          {screenings.map((screening, index) => (
            <ScreeningItem
              key={screening.id}
              patientId={patientId}
              screening={screening}
              editable={editable}
              isLatest={index === 0}
              members={members}
            />
          ))}
        </ul>
      )}
      {editable ? (
        <form
          noValidate
          aria-label="Registrar un cribado"
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          onSubmit={submitWith(form.handleSubmit(onSubmit))}
        >
          <h3 className="font-medium">Registrar un cribado</h3>
          {SCREENING_QUESTIONS.map(({ code, label }) => (
            <YesNoField
              key={code}
              label={label}
              disabled={record.isPending}
              error={form.formState.errors[code]?.message}
              registration={form.register(code, { required: 'Responde esta pregunta.' })}
            />
          ))}
          <TextAreaField
            label={SCREENING_DETAIL_LABEL}
            maxLength={2_000}
            {...form.register('S09')}
          />
          <FormError error={record.error} title="No se pudo registrar el cribado" />
          <div>
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? 'Registrando…' : 'Registrar cribado'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
