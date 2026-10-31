'use client';

import {
  PHYSICAL_MOMENT_LABELS,
  type CareTeamMember,
  type FunctionalCatalogResponse,
  type FunctionalEvaluation,
  type MemberResponse,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { STATUS_LABELS, STATUS_TONES } from '@/features/assessment/labels';
import { submitWith, TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { MovementTests } from './movement-tests';
import { PhysicalTests } from './physical-tests';
import { useEditsRecord } from './use-edits-record';
import { useFunctionalEvaluation } from './use-functional-evaluation';

const TITLES = { MOVEMENT: 'Evaluación postural', FITNESS: 'Pruebas físicas' } as const;

/** Cerrada, solo se enmienda con su motivo: nace una revisión con las mismas pruebas (RN-D08). */
function AmendForm({ evaluationId, base }: { evaluationId: string; base: string }) {
  const router = useRouter();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const amend = useMutation({
    mutationFn: (reason: string) =>
      apiFetch<{ id: string }>(`/functional-evaluations/${evaluationId}/amend`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: ({ id }) => {
      router.push(`${base}/${id}`);
    },
  });
  return (
    <form
      noValidate
      aria-label="Enmendar esta evaluación"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          amend.mutate(values.reason);
        }),
      )}
    >
      <TextAreaField
        label="Motivo de la enmienda"
        hint="Nace una revisión con las mismas pruebas. Esta queda como histórico."
        maxLength={500}
        error={form.formState.errors.reason?.message}
        {...form.register('reason', {
          validate: (value) => value.trim() !== '' || 'Escribe el motivo.',
        })}
      />
      <FormError error={amend.error} title="No se pudo enmendar" />
      <div>
        <Button type="submit" variant="secondary" disabled={amend.isPending}>
          {amend.isPending ? 'Enmendando…' : 'Enmendar'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Una evaluación postural o de pruebas físicas (RF-41): en borrador se registra prueba por prueba; cerrada queda de solo
 * lectura y se enmienda con su motivo (RN-D08). Escribe el equipo de atención con WRITE; decide la API.
 */
export function FunctionalEvaluationView({
  initial,
  catalog,
  targets,
  careTeam,
  members,
  archived,
  base,
}: {
  initial: FunctionalEvaluation;
  catalog: FunctionalCatalogResponse;
  targets: Readonly<Record<string, number>>;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
  base: string;
}) {
  const { timezone } = usePanelSession();
  const router = useRouter();
  const canEdit = useEditsRecord(careTeam, members, archived);
  const draft = useFunctionalEvaluation(initial);
  const { evaluation } = draft;
  const editable = canEdit && evaluation.status === 'DRAFT';
  const evaluator = members.find((m) => m.id === evaluation.evaluatorMemberId)?.displayName;
  const close = useMutation({
    mutationFn: () => draft.close(),
    onSuccess: () => {
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={base}
        className="inline-flex w-fit items-center gap-1 text-sm text-brand-text underline underline-offset-4"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Volver a la lista
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">
          {TITLES[evaluation.kind]}
          {evaluation.moment ? ` · ${PHYSICAL_MOMENT_LABELS[evaluation.moment]}` : ''}
        </h2>
        <StatusBadge tone={STATUS_TONES[evaluation.status]}>
          {STATUS_LABELS[evaluation.status]}
        </StatusBadge>
        {evaluation.revision > 1 ? (
          <span className="text-sm text-muted-foreground">Revisión {evaluation.revision}</span>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {formatInstant(evaluation.measuredAt, timezone)}
        {evaluator ? ` · Evaluó: ${evaluator}` : ''}
      </p>
      {evaluation.notes ? (
        <p className="text-sm whitespace-pre-wrap">Notas: {evaluation.notes}</p>
      ) : null}
      {evaluation.amendReason ? (
        <Notice
          tone="info"
          title={`Revisión ${String(evaluation.revision)}: enmienda`}
          rule="RN-D08"
        >
          {evaluation.amendReason}
        </Notice>
      ) : null}
      {evaluation.amendedByEvaluationId ? (
        <Notice tone="info" title="Esta evaluación se enmendó" rule="RN-D08">
          <Link
            href={`${base}/${evaluation.amendedByEvaluationId}`}
            className="text-brand-text underline underline-offset-4"
          >
            Ver la revisión
          </Link>
        </Notice>
      ) : null}
      {evaluation.kind === 'MOVEMENT' ? (
        <>
          <Notice
            tone="info"
            title="No usar esta pantalla para diagnosticar lesiones"
            rule="RN-F15"
          >
            Por lado: 2 adecuado, 1 compensación leve, 0 limitación clara. Con dolor, la prueba pasa
            a DERIVAR / REVISAR aunque falte un lado, y la propuesta se detiene desde el borrador.
          </Notice>
          <MovementTests tests={catalog.movementTests} draft={draft} editable={editable} />
        </>
      ) : (
        <PhysicalTests
          tests={catalog.physicalTests}
          targets={targets}
          draft={draft}
          editable={editable}
        />
      )}
      {editable ? (
        <div className="flex flex-col gap-3">
          <FormError error={close.error} title="No se pudo cerrar" />
          <div>
            <ConfirmDialog
              trigger={<Button disabled={close.isPending}>Cerrar evaluación</Button>}
              title="¿Cerrar esta evaluación?"
              description="Cerrada no se edita: solo se enmienda con un motivo."
              confirmLabel="Cerrar evaluación"
              onConfirm={() => {
                close.mutate();
              }}
            />
          </div>
        </div>
      ) : null}
      {canEdit && evaluation.status === 'CLOSED' && !evaluation.amendedByEvaluationId ? (
        <AmendForm evaluationId={evaluation.id} base={base} />
      ) : null}
    </div>
  );
}
