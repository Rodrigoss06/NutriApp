'use client';

import {
  EVALUATION_MODALITIES,
  EVALUATION_MODALITY_LABELS,
  MOVEMENT_TEST_KIND_LABELS,
  MOVEMENT_TEST_STATUS_LABELS,
  type FunctionalCatalogResponse,
  type MovementTestResult,
} from '@nutricoach/contracts';
import { Button, Notice, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { CheckboxField, submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { MOVEMENT_TEST_STATUS_TONES } from './labels';
import { TestEvidence } from './test-evidence';
import { evidenceUrlProblem, SCORE_OPTIONS, scoreOf, scoreText, textOrNull } from './test-values';
import type { FunctionalEvaluationDraft } from './use-functional-evaluation';

type MovementTest = FunctionalCatalogResponse['movementTests'][number];

interface MovementValues {
  readonly rightScore: string;
  readonly leftScore: string;
  readonly pain: boolean;
  readonly asymmetry: boolean;
  readonly modality: string;
  readonly observation: string;
  readonly actionNote: string;
  readonly reliabilityNote: string;
  readonly evidenceUrl: string;
}

const valuesOf = (row: MovementTestResult | undefined): MovementValues => ({
  rightScore: scoreText(row?.rightScore ?? null),
  leftScore: scoreText(row?.leftScore ?? null),
  pain: row?.pain ?? false,
  asymmetry: row?.asymmetry ?? false,
  modality: row?.modality ?? 'IN_PERSON',
  observation: row?.observation ?? '',
  actionNote: row?.actionNote ?? '',
  reliabilityNote: row?.reliabilityNote ?? '',
  evidenceUrl: row?.evidenceUrl ?? '',
});

const scoreLabel = (score: number | null) =>
  SCORE_OPTIONS.find((option) => option.value === scoreText(score))?.label ?? '—';

/** Lo registrado de una prueba, de solo lectura. */
function MovementFacts({ row }: { row: MovementTestResult }) {
  const facts: readonly (readonly [string, string | null])[] = [
    ['Derecha', scoreLabel(row.rightScore)],
    ['Izquierda', scoreLabel(row.leftScore)],
    ['Dolor', row.pain ? 'Sí' : 'No'],
    ['Asimetría', row.asymmetry ? 'Sí' : 'No'],
    ['Modalidad', EVALUATION_MODALITY_LABELS[row.modality]],
    ['Observación', row.observation],
    ['Acción o restricción', row.actionNote],
    ['Confiabilidad', row.reliabilityNote],
    ['Enlace de evidencia', row.evidenceUrl],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {facts
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function MovementTestRow({
  test,
  draft,
  editable,
}: {
  test: MovementTest;
  draft: FunctionalEvaluationDraft;
  editable: boolean;
}) {
  const row = draft.evaluation.movementTests.find((r) => r.testCode === test.code);
  const form = useForm<MovementValues>({ defaultValues: valuesOf(row) });
  const save = useMutation({
    mutationFn: (values: MovementValues) =>
      draft.saveMovementTest(test.code, {
        rightScore: scoreOf(values.rightScore),
        leftScore: scoreOf(values.leftScore),
        pain: values.pain,
        asymmetry: values.asymmetry,
        modality: values.modality as MovementTestResult['modality'],
        observation: textOrNull(values.observation),
        actionNote: textOrNull(values.actionNote),
        reliabilityNote: textOrNull(values.reliabilityNote),
        evidenceUrl: textOrNull(values.evidenceUrl),
      }),
    onSuccess: (next) => {
      form.reset(valuesOf(next.movementTests.find((r) => r.testCode === test.code)));
    },
  });
  const remove = useMutation({
    mutationFn: () => draft.removeTest(test.code),
    onSuccess: () => {
      form.reset(valuesOf(undefined));
    },
  });
  const pending = save.isPending || remove.isPending;

  return (
    <details className="rounded-lg border border-border bg-card">
      <summary className="flex min-h-touch cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span className="font-medium">{test.name}</span>
        <span className="text-sm text-muted-foreground">{test.region}</span>
        {row ? (
          <StatusBadge tone={MOVEMENT_TEST_STATUS_TONES[row.status]}>
            {MOVEMENT_TEST_STATUS_LABELS[row.status]}
          </StatusBadge>
        ) : (
          <span className="text-sm text-muted-foreground">Sin registrar</span>
        )}
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-4">
        {row?.status === 'REFER' ? (
          <Notice tone="danger" title="Dolor registrado" rule="RN-F15">
            Mientras siga así, no hay propuesta de entrenamiento.
          </Notice>
        ) : null}
        {row ? (
          <p className="text-xs text-muted-foreground">
            Estado según las reglas de seguridad {row.ruleVersion}.
          </p>
        ) : null}
        {editable ? (
          <form
            noValidate
            aria-label={`Registrar ${test.name}`}
            className="flex flex-col gap-4"
            onSubmit={submitWith(
              form.handleSubmit((values) => {
                save.mutate(values);
              }),
            )}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="rightScore"
                render={({ field }) => (
                  <Select
                    label="Derecha"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={SCORE_OPTIONS}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="leftScore"
                render={({ field }) => (
                  <Select
                    label="Izquierda"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={SCORE_OPTIONS}
                  />
                )}
              />
            </div>
            <div className="grid sm:grid-cols-2">
              <CheckboxField label="Dolor" {...form.register('pain')} />
              <CheckboxField label="Asimetría" {...form.register('asymmetry')} />
            </div>
            <Controller
              control={form.control}
              name="modality"
              render={({ field }) => (
                <Select
                  label="Modalidad"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={EVALUATION_MODALITIES.map((code) => ({
                    value: code,
                    label: EVALUATION_MODALITY_LABELS[code],
                  }))}
                />
              )}
            />
            <TextAreaField
              label="Observación"
              maxLength={1_000}
              {...form.register('observation')}
            />
            <TextAreaField
              label="Acción o restricción"
              maxLength={1_000}
              {...form.register('actionNote')}
            />
            <TextField
              label="Confiabilidad"
              autoComplete="off"
              maxLength={300}
              {...form.register('reliabilityNote')}
            />
            <TextField
              label="Enlace de evidencia"
              type="url"
              inputMode="url"
              autoComplete="off"
              hint="Una carpeta restringida, con https. Exige el consentimiento de imágenes vigente."
              error={form.formState.errors.evidenceUrl?.message}
              {...form.register('evidenceUrl', {
                validate: (value) => evidenceUrlProblem(value) ?? true,
              })}
            />
            <FormError error={save.error} title="No se pudo guardar la prueba" />
            <FormError error={remove.error} title="No se pudo quitar la prueba" />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {save.isPending ? 'Guardando…' : 'Guardar prueba'}
              </Button>
              {row ? (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    remove.mutate();
                  }}
                >
                  Quitar prueba
                </Button>
              ) : null}
            </div>
          </form>
        ) : row ? (
          <MovementFacts row={row} />
        ) : (
          <p className="text-sm text-muted-foreground">Esta prueba no se registró.</p>
        )}
        <TestEvidence
          evaluationId={draft.evaluation.id}
          testCode={test.code}
          testName={test.name}
          recorded={row !== undefined}
          hasFile={row?.hasEvidenceFile ?? false}
          editable={editable}
          onAttach={(file) => draft.attachEvidence(test.code, file)}
          onRemove={() => draft.removeEvidence(test.code)}
        />
      </div>
    </details>
  );
}

/** Las 14 pruebas de postura y movimiento (07 §3.3), estáticas y dinámicas, cada una con su estado según el motor. */
export function MovementTests({
  tests,
  draft,
  editable,
}: {
  tests: FunctionalCatalogResponse['movementTests'];
  draft: FunctionalEvaluationDraft;
  editable: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {(['STATIC', 'DYNAMIC'] as const).map((kind) => (
        <section key={kind} className="flex flex-col gap-2" aria-labelledby={`pruebas-${kind}`}>
          <h3 id={`pruebas-${kind}`} className="font-medium">
            {MOVEMENT_TEST_KIND_LABELS[kind]}s
          </h3>
          {tests
            .filter((test) => test.kind === kind)
            .map((test) => (
              <MovementTestRow key={test.code} test={test} draft={draft} editable={editable} />
            ))}
        </section>
      ))}
    </div>
  );
}
