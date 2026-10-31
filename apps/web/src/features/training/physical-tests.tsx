'use client';

import {
  EVALUATION_MODALITIES,
  EVALUATION_MODALITY_LABELS,
  parseDecimal,
  PHYSICAL_DOMAIN_LABELS,
  type FunctionalCatalogResponse,
  type PhysicalTestResult,
} from '@nutricoach/contracts';
import { Button, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { formatTestValue } from './labels';
import { TestEvidence } from './test-evidence';
import { evidenceUrlProblem, physicalValueProblem, textOrNull } from './test-values';
import type { FunctionalEvaluationDraft } from './use-functional-evaluation';

type PhysicalTest = FunctionalCatalogResponse['physicalTests'][number];

interface PhysicalValues {
  readonly value: string;
  readonly modality: string;
  readonly notes: string;
  readonly evidenceUrl: string;
}

const valuesOf = (row: PhysicalTestResult | undefined): PhysicalValues => ({
  value: row ? String(row.value) : '',
  modality: row?.modality ?? 'IN_PERSON',
  notes: row?.notes ?? '',
  evidenceUrl: row?.evidenceUrl ?? '',
});

function PhysicalTestRow({
  test,
  target,
  draft,
  editable,
}: {
  test: PhysicalTest;
  target: number | undefined;
  draft: FunctionalEvaluationDraft;
  editable: boolean;
}) {
  const row = draft.evaluation.physicalResults.find((r) => r.testCode === test.code);
  const form = useForm<PhysicalValues>({ defaultValues: valuesOf(row) });
  const save = useMutation({
    mutationFn: (values: PhysicalValues) =>
      draft.savePhysicalResult(test.code, {
        value: parseDecimal(values.value) ?? 0,
        modality: values.modality as PhysicalTestResult['modality'],
        notes: textOrNull(values.notes),
        evidenceUrl: textOrNull(values.evidenceUrl),
      }),
    onSuccess: (next) => {
      form.reset(valuesOf(next.physicalResults.find((r) => r.testCode === test.code)));
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
        <span className="text-sm tabular-nums">
          {row ? `${formatTestValue(row.value)} ${row.unit}` : 'Sin registrar'}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-4">
        <p className="text-sm text-muted-foreground">
          Protocolo: {test.protocol}.
          {target === undefined ? '' : ` Objetivo: ${formatTestValue(target)} ${test.unit}.`}
        </p>
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
            <TextField
              label={`Valor (${test.unit})`}
              inputMode="decimal"
              autoComplete="off"
              error={form.formState.errors.value?.message}
              {...form.register('value', {
                validate: (value) => physicalValueProblem(value) ?? true,
              })}
            />
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
              label="Observación, material y seguridad"
              maxLength={1_000}
              {...form.register('notes')}
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
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Modalidad</dt>
              <dd>{EVALUATION_MODALITY_LABELS[row.modality]}</dd>
            </div>
            {row.notes ? (
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Observación</dt>
                <dd className="break-words whitespace-pre-wrap">{row.notes}</dd>
              </div>
            ) : null}
            {row.evidenceUrl ? (
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Enlace de evidencia</dt>
                <dd className="break-words">{row.evidenceUrl}</dd>
              </div>
            ) : null}
          </dl>
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

/** Las 15 pruebas físicas por dominio (07 §4), cada una con su unidad, su protocolo y su objetivo si lo tiene. */
export function PhysicalTests({
  tests,
  targets,
  draft,
  editable,
}: {
  tests: FunctionalCatalogResponse['physicalTests'];
  targets: Readonly<Record<string, number>>;
  draft: FunctionalEvaluationDraft;
  editable: boolean;
}) {
  const domains = [...new Set(tests.map((test) => test.domain))];
  return (
    <div className="flex flex-col gap-6">
      {domains.map((domain) => (
        <section key={domain} className="flex flex-col gap-2" aria-labelledby={`dominio-${domain}`}>
          <h3 id={`dominio-${domain}`} className="font-medium">
            {(PHYSICAL_DOMAIN_LABELS as Readonly<Record<string, string>>)[domain] ?? domain}
          </h3>
          {tests
            .filter((test) => test.domain === domain)
            .map((test) => (
              <PhysicalTestRow
                key={test.code}
                test={test}
                target={targets[test.code]}
                draft={draft}
                editable={editable}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
