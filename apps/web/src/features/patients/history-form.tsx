'use client';

import type {
  ClinicalHistoryAnswersV1,
  ClinicalHistoryResponse,
  MemberResponse,
} from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { submitWith, TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';
import { formatInstant } from '@/lib/dates';
import { HISTORY_BLOCKS } from './labels';

type BlockKey = keyof ClinicalHistoryAnswersV1;
type Values = Record<BlockKey, string>;
type Current = ClinicalHistoryResponse['current'];

const REVISION_CONFLICT = 'NC-CLI-019';

const valuesOf = (current: Current): Values =>
  Object.fromEntries(
    HISTORY_BLOCKS.map((block) => [block.key, current?.answers[block.key] ?? '']),
  ) as Values;

/**
 * Historia clínica v1 (RF-09, ⚠️ provisional): texto libre por bloque. Cada guardado es una revisión nueva sobre la
 * que se editó. Si alguien guardó antes (409), lo escrito no se borra: se carga la versión actual para compararla y
 * se vuelve a guardar sobre ella. Sin HEALTH_DATA vigente, la API responde 422 con RN-B01.
 */
export function HistoryForm({
  patientId,
  history,
  members,
  archived,
}: {
  patientId: string;
  history: ClinicalHistoryResponse;
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const router = useRouter();
  const { timezone } = usePanelSession();
  const canWrite = useCanWrite() && !archived;
  const names = new Map(members.map((m) => [m.userId, m.displayName]));
  const [expectedRevision, setExpectedRevision] = useState(history.current?.revision ?? 0);
  const [latest, setLatest] = useState<Current | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const form = useForm<Values>({ defaultValues: valuesOf(history.current) });

  const save = useMutation({
    mutationFn: (answers: Partial<Values>) =>
      apiFetch<{ revision: number }>(`/patients/${patientId}/clinical-history`, {
        method: 'PUT',
        body: { expectedRevision, answers },
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
  const typed = useWatch({ control: form.control });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          const answers = Object.fromEntries(
            Object.entries(values)
              .map(([key, value]) => [key, value.trim()] as const)
              .filter(([, value]) => value !== ''),
          ) as Partial<Values>;
          save.mutate(answers);
        }),
      )}
    >
      <Notice tone="info" title="Formulario provisional">
        Texto libre por bloque hasta tener la ficha de anamnesis de la organización. Las
        condiciones, alergias, medicamentos, cirugías y lesiones también se registran como filas en
        «Condiciones, objetivos y notas».
      </Notice>
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
        <FormError error={save.error} title="No se guardó la historia clínica" />
      )}
      <FormError error={load.error} title="No pudimos cargar la versión actual" />
      {latest ? (
        <Notice tone="info" title={`Versión actual: revisión ${String(latest.revision)}`}>
          Guardada el {formatInstant(latest.recordedAt, timezone)} por{' '}
          {names.get(latest.recordedBy) ?? 'otra persona'}. Debajo de cada bloque que cambió verás
          su texto; al guardar, tu versión queda como la revisión siguiente.
        </Notice>
      ) : null}
      {saved ? <Notice tone="success" title={`Revisión ${String(saved)} guardada`} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {HISTORY_BLOCKS.map((block) => {
          const theirs = latest?.answers[block.key] ?? '';
          const differs = latest !== null && theirs !== (typed[block.key] ?? '');
          return (
            <div key={block.key} className="flex flex-col gap-2">
              <TextAreaField
                label={block.label}
                maxLength={2000}
                disabled={!canWrite}
                {...form.register(block.key)}
              />
              {differs ? (
                <div className="rounded-md bg-surface p-3 text-sm">
                  <p className="font-medium">En la revisión {latest.revision}:</p>
                  <p className="whitespace-pre-wrap">{theirs || '(vacío)'}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div>
        <Button type="submit" disabled={!canWrite || save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar historia clínica'}
        </Button>
      </div>
      <section aria-labelledby="revisiones" className="flex flex-col gap-2">
        <h3 id="revisiones" className="font-semibold">
          Revisiones
        </h3>
        {history.revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay revisiones.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.revisions.map((revision) => (
              <li key={revision.revision}>
                Revisión {revision.revision} · {formatInstant(revision.recordedAt, timezone)} ·{' '}
                {names.get(revision.recordedBy) ?? 'Miembro de la organización'}
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}
