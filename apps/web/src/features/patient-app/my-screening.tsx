'use client';

import {
  SCREENING_DETAIL_LABEL,
  SCREENING_QUESTIONS,
  type MeScreening,
  type RecordScreening,
} from '@nutricoach/contracts';
import { Button, cn, Notice } from '@nutricoach/ui';
import { useId, useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { newActionKey, useMeAction } from './records';

type Code = (typeof SCREENING_QUESTIONS)[number]['code'];
type Answers = Partial<Record<Code, boolean>>;

/** Una pregunta de Sí o No con radios nativos de 44 px. */
function YesNo({
  question,
  value,
  onChange,
  disabled,
}: {
  question: string;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{question}</legend>
      <div className="flex gap-2">
        {[
          { label: 'Sí', answer: true },
          { label: 'No', answer: false },
        ].map(({ label, answer }) => (
          <label key={label} className="flex-1">
            <input
              type="radio"
              name={name}
              checked={value === answer}
              disabled={disabled}
              onChange={() => {
                onChange(answer);
              }}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-touch cursor-pointer items-center justify-center rounded-md border border-brand-border bg-card font-medium text-brand-text',
                'peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-border',
                'peer-disabled:opacity-50',
              )}
            >
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * El cribado previo al ejercicio desde la app (07 §3.2, RN-F15): ocho preguntas de Sí o No. Una respuesta afirmativa no es un
 * diagnóstico: detiene la propuesta de rutina hasta que el coach decide. Se puede volver a responder; queda el historial.
 */
export function MyScreening({ latest }: { latest: MeScreening['latest'] }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [detail, setDetail] = useState('');
  const answer = useMeAction<{ id: string }>('/me/screening');
  const complete = SCREENING_QUESTIONS.every(({ code }) => answers[code] !== undefined);
  const anyYes = SCREENING_QUESTIONS.some(({ code }) => answers[code] === true);

  const submit = () => {
    if (!complete) return;
    const body: RecordScreening = {
      answers: {
        S01: answers.S01 === true,
        S02: answers.S02 === true,
        S03: answers.S03 === true,
        S04: answers.S04 === true,
        S05: answers.S05 === true,
        S06: answers.S06 === true,
        S07: answers.S07 === true,
        S08: answers.S08 === true,
        ...(anyYes && detail.trim() ? { S09: detail.trim() } : {}),
      },
    };
    answer.mutate(
      { body, key: newActionKey() },
      {
        onSuccess: () => {
          setAnswers({});
          setDetail('');
        },
      },
    );
  };

  const form = (
    <form
      noValidate
      aria-label="Cribado de seguridad"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Notice tone="info" title="Una respuesta afirmativa no equivale por sí sola a un diagnóstico">
        Solo pide que tu coach lo revise antes de proponerte la rutina.
      </Notice>
      {SCREENING_QUESTIONS.map(({ code, label }) => (
        <YesNo
          key={code}
          question={label}
          value={answers[code]}
          disabled={answer.isPending}
          onChange={(value) => {
            setAnswers((current) => ({ ...current, [code]: value }));
          }}
        />
      ))}
      {anyYes ? (
        <TextAreaField
          label={SCREENING_DETAIL_LABEL}
          maxLength={2_000}
          value={detail}
          onChange={(event) => {
            setDetail(event.target.value);
          }}
        />
      ) : null}
      <FormError error={answer.error} title="No se enviaron tus respuestas" />
      <Button type="submit" size="touch" disabled={!complete || answer.isPending}>
        {answer.isPending ? 'Enviando…' : 'Enviar mis respuestas'}
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-3">
      {answer.isSuccess ? <Notice tone="success" title="Respuestas enviadas" /> : null}
      {latest === null ? (
        <p className="text-sm text-muted-foreground">
          Antes de entrenar, tu coach necesita saber si hay algo que cuidar. Toma un minuto.
        </p>
      ) : latest.awaitingReview ? (
        <Notice tone="warning" title="Tu coach revisará tus respuestas">
          Mientras tanto no te propondrá una rutina nueva. Si algo cambió, puedes responder otra
          vez.
        </Notice>
      ) : (
        <Notice tone="success" title="Ya respondiste el cribado">
          Si algo cambió, responde otra vez: tu coach verá las respuestas nuevas.
        </Notice>
      )}
      {latest === null ? (
        form
      ) : (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="flex min-h-touch cursor-pointer items-center font-medium">
            Responder otra vez
          </summary>
          <div className="mt-3">{form}</div>
        </details>
      )}
    </div>
  );
}
