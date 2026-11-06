'use client';

import {
  COACH_DECISIONS,
  decideWeeklyReviewSchema,
  type CareTeamMember,
  type DecideWeeklyReview,
  type MemberResponse,
  type WeeklyReviewDecisionResponse,
} from '@nutricoach/contracts';
import { Button, cn, Notice, NumberField } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { COACH_DECISION_LABELS } from './labels';
import { formatFactor, roundFactor } from './weekly-review-view';

type Decision = DecideWeeklyReview['decision'];
type Problems = Partial<Record<'decision' | 'volumeFactor' | 'note', string>>;

const DECISION_HINTS: Readonly<Record<Decision, string>> = {
  KEEP: 'La semana siguiente queda como está en el plan.',
  ADJUST:
    'Crea la versión siguiente del programa en borrador, con este factor en la semana siguiente.',
  DELOAD:
    'Crea la versión siguiente del programa en borrador, con este factor en la semana siguiente.',
};

/**
 * La decisión del coach sobre el control semanal (RN-F17): mantener, ajustar o descargar, siempre con nota. Al ajustar o
 * descargar, el factor de la semana siguiente se prellena con el sugerido por el método a 2 decimales (ADR-090) y se puede
 * cambiar. La semana cambia para el paciente solo al publicar la versión nueva del programa (RN-F12). Decide quien escribe
 * en el expediente; la API decide.
 */
export function WeeklyDecisionForm({
  patientId,
  reviewId,
  weekNo,
  suggestedVolumeFactor,
  nextWeek,
  careTeam,
  members,
}: {
  patientId: string;
  reviewId: string;
  weekNo: number;
  suggestedVolumeFactor: number | null;
  nextWeek: { readonly exists: boolean; readonly factor: number | null };
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
}) {
  const router = useRouter();
  const groupId = useId();
  const canWrite = useCanWrite();
  const writes = useWritesRecord(careTeam, members);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [factor, setFactor] = useState<number | null>(
    suggestedVolumeFactor === null ? null : roundFactor(suggestedVolumeFactor),
  );
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<Problems>({});
  const save = useMutation({
    mutationFn: (body: DecideWeeklyReview) =>
      apiFetch<WeeklyReviewDecisionResponse>(
        `/patients/${patientId}/weekly-reviews/${reviewId}/decision`,
        { method: 'POST', body },
      ),
    onSuccess: () => {
      router.refresh();
    },
  });

  if (!canWrite || !writes) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin decidir. Decide quien escribe en el expediente del paciente.
      </p>
    );
  }

  const submit = () => {
    if (decision === null) {
      setProblems({ decision: 'Elige mantener, ajustar o descargar.' });
      return;
    }
    const parsed = decideWeeklyReviewSchema.safeParse({
      decision,
      volumeFactor: decision === 'KEEP' ? null : factor,
      note,
    });
    if (!parsed.success) {
      const found: Problems = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === 'volumeFactor' || key === 'note') && !found[key]) found[key] = issue.message;
      }
      setProblems(found);
      return;
    }
    setProblems({});
    save.mutate(parsed.data);
  };

  const changes = decision !== null && decision !== 'KEEP';
  return (
    <form
      noValidate
      aria-label={`Decisión de la semana ${String(weekNo)}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset
        className="flex flex-col gap-1.5"
        aria-describedby={problems.decision ? `${groupId}-error` : undefined}
      >
        <legend className="text-sm font-medium">Decisión</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {COACH_DECISIONS.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={`${groupId}-decision`}
                value={option}
                checked={decision === option}
                onChange={() => {
                  setDecision(option);
                  setProblems((current) => ({ ...current, decision: undefined }));
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex min-h-touch cursor-pointer items-center justify-center rounded-md border border-brand-border bg-card px-3 text-sm font-medium text-brand-text',
                  'peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-border',
                )}
              >
                {COACH_DECISION_LABELS[option]}
              </span>
            </label>
          ))}
        </div>
        {problems.decision ? (
          <p id={`${groupId}-error`} className="text-sm text-danger">
            {problems.decision}
          </p>
        ) : null}
        {decision ? (
          <p className="text-sm text-muted-foreground">{DECISION_HINTS[decision]}</p>
        ) : null}
      </fieldset>
      {changes && !nextWeek.exists ? (
        <Notice tone="info" title="Es la última semana del programa">
          La decisión queda registrada, pero no hay semana siguiente que cambiar.
        </Notice>
      ) : null}
      {changes ? (
        <NumberField
          label={`Factor de volumen de la semana ${String(weekNo + 1)}`}
          value={factor}
          onValueChange={setFactor}
          className="max-w-xs"
          hint={`Sugerido por el método: ${formatFactor(suggestedVolumeFactor)}. ${
            nextWeek.factor === null
              ? 'El plan no le da factor a esa semana.'
              : `El plan tiene ${formatFactor(nextWeek.factor)} para esa semana.`
          }`}
          error={problems.volumeFactor}
        />
      ) : null}
      <TextAreaField
        label="Nota"
        hint="Obligatoria: por qué decides esto. Queda con tu nombre y la fecha."
        maxLength={1_000}
        value={note}
        error={problems.note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <FormError error={save.error} title="No se registró la decisión" />
      <div>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Registrando…' : 'Registrar decisión'}
        </Button>
      </div>
    </form>
  );
}
