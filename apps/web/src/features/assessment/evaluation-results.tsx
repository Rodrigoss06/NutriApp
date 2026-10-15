'use client';

import {
  LEE_REFERENCE_GROUP_COEFFICIENTS,
  methodLabel,
  METRIC_LABELS,
  type CalculationResultResponse,
  type EvaluationResponse,
  type EvaluationResultsResponse,
  type MeasurementSite,
  type MemberResponse,
  type RecalculateResponse,
  type TargetWeightResponse,
  type TechnicalErrorsResponse,
} from '@nutricoach/contracts';
import {
  Button,
  ConfirmDialog,
  formatNumber,
  IndicatorCard,
  MethodBadge,
  Notice,
  parseDecimal,
  Select,
  StatusBadge,
} from '@nutricoach/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import {
  formatReading,
  METRIC_NUMBER_KINDS,
  METRIC_UNIT_LABELS,
  PURPOSE_LABELS,
  SITE_NUMBER_KINDS,
  unavailableReason,
} from './labels';
import { InterpretationText, MetricLine } from './metric-line';
import { TableScroll } from '@/features/shell/table-scroll';

const INDEX_METHODS = new Set(['BMI', 'WAIST_HEIGHT', 'WAIST_HIP']);
const PROPORTION_METHODS = new Set(['CORMIC_INDEX', 'MANOUVRIER_INDEX', 'ACROMIOILIAC_INDEX']);
const COMPOSITION_ORDER = [
  'FAT_DW1974_SIRI1961',
  'FAT_JP1978_7',
  'FAT_FAULKNER1968',
  'FAT_YUHASZ1974',
  'COMP4_DEROSE_GUIMARAES',
  'MUSCLE_LEE2000',
  'COMP5_KERR1988',
];
const orderOf = (code: string) => {
  const index = COMPOSITION_ORDER.indexOf(code);
  return index === -1 ? COMPOSITION_ORDER.length : index;
};

/**
 * Resultados de una evaluación cerrada (RF-15): cada número con su método (RN-D02) y cada interpretación con su fuente
 * (RN-D10). Mientras el worker calcula, «Calculando…» y se consulta otra vez. Recalcular es explícito y deja lo
 * anterior como histórico (RN-D08); una evaluación cerrada no se edita: se enmienda con motivo (RN-C07).
 */
export function EvaluationResults({
  evaluation,
  sites,
  members,
  patientId,
}: {
  evaluation: EvaluationResponse;
  sites: readonly MeasurementSite[];
  members: readonly MemberResponse[];
  patientId: string;
}) {
  const canWrite = useCanWrite();
  const siteName = (code: string) => sites.find((site) => site.code === code)?.nameEs ?? code;
  const results = useQuery({
    queryKey: ['evaluation-results', evaluation.id],
    queryFn: () => apiFetch<EvaluationResultsResponse>(`/evaluations/${evaluation.id}/results`),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 2000 : false),
  });
  const evaluator = members.find((m) => m.id === evaluation.evaluatorMemberId);
  const base = `/panel/pacientes/${patientId}/evaluaciones/${evaluation.id}`;

  return (
    <div className="flex flex-col gap-8">
      {evaluation.status === 'CLOSED' ? (
        <div className="flex flex-wrap gap-2">
          {evaluation.kind === 'BIA' ? null : (
            <Button asChild variant="secondary">
              <Link href={`${base}/comparacion`}>Comparar con la anterior</Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href={`/panel/pacientes/${patientId}/energia/nueva?evaluacion=${evaluation.id}`}>
              Prescribir energía
            </Link>
          </Button>
        </div>
      ) : null}

      {results.isPending ? <p className="text-muted-foreground">Cargando…</p> : null}
      <FormError error={results.error} title="No pudimos cargar los resultados" />
      {results.data ? <ResultsBody data={results.data} siteName={siteName} sites={sites} /> : null}

      {evaluation.biaReadings.length > 0 ? (
        <section aria-labelledby="bia-resultados" className="flex flex-col gap-3">
          <h2 id="bia-resultados" className="text-lg font-semibold">
            Bioimpedancia
          </h2>
          <p className="text-sm text-muted-foreground">
            Valores del equipo, rotulados con su marca y modelo. No se comparan con los de pliegues
            (RN-C08).
          </p>
          {evaluation.biaReadings.map((reading) => (
            <article
              key={reading.id}
              aria-label={`Lectura de ${reading.deviceBrand} ${reading.deviceModel}`}
              className="flex flex-col gap-2 rounded-lg border border-border p-4"
            >
              <h3 className="font-medium">
                {reading.deviceBrand} · {reading.deviceModel}
              </h3>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {reading.readings.map((value) => (
                  <div key={value.metric} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{value.deviceLabel}</dt>
                    <dd className="tabular-nums">
                      {formatReading(value.value, value.unit)}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({reading.deviceBrand} {reading.deviceModel})
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </section>
      ) : null}

      {evaluation.kind === 'BIA' ? null : <TargetWeight evaluationId={evaluation.id} />}

      <EvaluatorTem
        memberId={evaluation.evaluatorMemberId}
        name={evaluator?.displayName ?? 'quien evaluó'}
      />

      {evaluation.measurements.length > 0 ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium">Tomas de cada sitio</summary>
          <TableScroll label="Tomas de cada sitio" className="mt-3 rounded-none border-0">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Tomas y consolidado de cada sitio</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Sitio
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Tomas
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Consolidado
                  </th>
                </tr>
              </thead>
              <tbody>
                {evaluation.measurements.map((m) => {
                  const site = sites.find((s) => s.code === m.siteCode);
                  const kind = site ? SITE_NUMBER_KINDS[site.unit] : 'length';
                  return (
                    <tr key={m.siteCode} className="border-t border-border">
                      <td className="py-2 pr-3">{site?.nameEs ?? m.siteCode}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {m.attempts.map((value) => formatNumber(value, kind)).join(' · ')}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatNumber(m.consolidatedValue, kind)} {site?.unit ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </details>
      ) : null}

      {canWrite && evaluation.status === 'CLOSED' ? (
        <EvaluationActions evaluationId={evaluation.id} patientId={patientId} />
      ) : null}
    </div>
  );
}

function ResultsBody({
  data,
  siteName,
  sites,
}: {
  data: EvaluationResultsResponse;
  siteName: (code: string) => string;
  sites: readonly MeasurementSite[];
}) {
  if (data.status === 'PENDING') {
    return (
      <Notice tone="info" title="Calculando los resultados…">
        Aparecen solos en unos segundos.
      </Notice>
    );
  }
  const current = data.results.filter((r) => r.status === 'CURRENT');
  const superseded = data.results.filter((r) => r.status === 'SUPERSEDED');
  const indices = current.filter((r) => INDEX_METHODS.has(r.methodCode));
  const proportions = current.filter((r) => PROPORTION_METHODS.has(r.methodCode));
  const composition = current
    .filter((r) => !INDEX_METHODS.has(r.methodCode) && !PROPORTION_METHODS.has(r.methodCode))
    .sort((a, b) => orderOf(a.methodCode) - orderOf(b.methodCode));

  return (
    <>
      {data.populationNote ? (
        <Notice tone="info" title="Población" rule="RN-D05">
          {data.populationNote}
        </Notice>
      ) : null}

      <section aria-labelledby="indices-titulo" className="flex flex-col gap-3">
        <h2 id="indices-titulo" className="text-lg font-semibold">
          Índices
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {indices.flatMap((result) =>
            result.metrics.map((metric) => (
              <IndicatorCard
                key={`${result.id}-${metric.metricCode}`}
                label={METRIC_LABELS[metric.metricCode]}
                value={formatNumber(metric.value, METRIC_NUMBER_KINDS[metric.metricCode])}
                unit={METRIC_UNIT_LABELS[metric.unit] || undefined}
                method={
                  <MethodBadge label={methodLabel(metric.methodCode)} code={metric.methodCode} />
                }
                status={
                  <InterpretationText
                    interpretation={metric.interpretation}
                    note={metric.interpretationNote}
                  />
                }
              />
            )),
          )}
          {data.siteInterpretations.map((site) => {
            const catalog = sites.find((s) => s.code === site.siteCode);
            return (
              <IndicatorCard
                key={site.siteCode}
                label={siteName(site.siteCode)}
                value={formatNumber(
                  site.value,
                  catalog ? SITE_NUMBER_KINDS[catalog.unit] : 'length',
                )}
                unit={site.unit}
                method={<MethodBadge label={methodLabel(site.methodCode)} code={site.methodCode} />}
                status={
                  <InterpretationText
                    interpretation={site.interpretation}
                    note={site.interpretationNote}
                  />
                }
              />
            );
          })}
        </div>
      </section>

      {composition.length > 0 || data.unavailable.length > 0 ? (
        <section aria-labelledby="composicion-titulo" className="flex flex-col gap-3">
          <h2 id="composicion-titulo" className="text-lg font-semibold">
            Composición corporal
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {composition.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
          {data.unavailable.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">No disponibles</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {data.unavailable.map((method) => (
                  <li key={method.methodCode}>
                    <span className="font-medium">{methodLabel(method.methodCode)}:</span>{' '}
                    {unavailableReason(method, siteName)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {proportions.length > 0 ? (
        <section aria-labelledby="proporcionalidad-titulo" className="flex flex-col gap-3">
          <h2 id="proporcionalidad-titulo" className="text-lg font-semibold">
            Proporcionalidad
          </h2>
          <dl className="flex flex-col divide-y divide-border rounded-lg border border-border px-4">
            {proportions.flatMap((result) =>
              result.metrics.map((metric) => (
                <MetricLine key={`${result.id}-${metric.metricCode}`} metric={metric} />
              )),
            )}
          </dl>
        </section>
      ) : null}

      {superseded.length > 0 ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium">
            Resultados reemplazados ({superseded.length})
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Quedaron como histórico al recalcular (RN-D08).
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {superseded.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

/** Un resultado: su método con versión, si es el principal, sus avisos (RN-D06) y cada indicador con su método. */
function ResultCard({ result }: { result: CalculationResultResponse }) {
  const id = `resultado-${result.id}`;
  return (
    <article
      aria-labelledby={id}
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 id={id} className="font-semibold">
          {methodLabel(result.methodCode)}
        </h3>
        {result.principalFor.map((purpose) => (
          <StatusBadge key={purpose} tone="info">
            Principal: {PURPOSE_LABELS[purpose].toLowerCase()}
          </StatusBadge>
        ))}
        {result.status === 'SUPERSEDED' ? (
          <StatusBadge tone="warning">Reemplazado</StatusBadge>
        ) : null}
      </header>
      <p className="text-xs text-muted-foreground">
        Versión {result.methodVersion} · motor {result.engineVersion}
      </p>
      {result.warnings.map((warning) => (
        <Notice
          key={warning.code}
          tone={warning.severity === 'WARNING' ? 'warning' : 'info'}
          title={warning.message}
          rule={warning.rule}
        />
      ))}
      <dl className="flex flex-col divide-y divide-border">
        {result.metrics.map((metric) => (
          <MetricLine key={metric.metricCode} metric={metric} />
        ))}
      </dl>
    </article>
  );
}

/** Peso objetivo con un % de grasa deseado (RN-E06, G-12): se calcula en la API y no se guarda. */
function TargetWeight({ evaluationId }: { evaluationId: string }) {
  const [text, setText] = useState('15');
  const target = parseDecimal(text);
  const query = useMutation({
    mutationFn: (pct: number) =>
      apiFetch<TargetWeightResponse>(
        `/evaluations/${evaluationId}/target-weight?targetFatPct=${encodeURIComponent(String(pct))}`,
      ),
  });
  return (
    <section aria-labelledby="peso-objetivo-titulo" className="flex flex-col gap-3">
      <h2 id="peso-objetivo-titulo" className="text-lg font-semibold">
        Peso objetivo
      </h2>
      <form
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (target !== null && target > 0 && target < 100) query.mutate(target);
        }}
      >
        <div className="sm:w-56">
          <TextField
            label="% de grasa deseado"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            error={target !== null && (target <= 0 || target >= 100) ? 'Entre 0 y 100.' : undefined}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={query.isPending}>
          Calcular el peso objetivo
        </Button>
      </form>
      <FormError error={query.error} title="No se pudo calcular" />
      {query.data ? (
        <p className="text-sm" role="status">
          Con {formatNumber(query.data.targetFatPct, 'percent')} % de grasa:{' '}
          <span className="font-semibold tabular-nums">
            {formatNumber(query.data.targetWeightKg, 'mass')} kg
          </span>
          {query.data.weightChangeKg < 0
            ? `, perder ${formatNumber(-query.data.weightChangeKg, 'mass')} kg`
            : `, ganar ${formatNumber(query.data.weightChangeKg, 'mass')} kg`}{' '}
          <MethodBadge label={methodLabel(query.data.methodCode)} code={query.data.methodCode} />{' '}
          <span className="text-xs text-muted-foreground">
            (masa libre de grasa {formatNumber(query.data.fatFreeMassKg, 'mass')} kg,{' '}
            {methodLabel(query.data.fatFreeMassMethodCode)})
          </span>
        </p>
      ) : null}
    </section>
  );
}

/** El ETM de quien evaluó (RF-12, RN-C05): de él sale el CMD95 de la comparación. */
function EvaluatorTem({ memberId, name }: { memberId: string; name: string }) {
  const tem = useQuery({
    queryKey: ['technical-errors', memberId],
    queryFn: () => apiFetch<TechnicalErrorsResponse>(`/members/${memberId}/technical-errors`),
  });
  const skinfolds = tem.data?.pooled.find((group) => group.family === 'SKINFOLD');
  return (
    <section aria-labelledby="etm-titulo" className="flex flex-col gap-2">
      <h2 id="etm-titulo" className="text-lg font-semibold">
        Error técnico de medida
      </h2>
      {tem.isPending ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
      {tem.data && !skinfolds ? (
        <p className="text-sm text-muted-foreground">
          {name} no tiene un estudio de ETM de pliegues: la comparación no puede separar un cambio
          real del error de medición. Se registra en «Mi cuenta».
        </p>
      ) : null}
      {skinfolds ? (
        <p className="text-sm">
          ETM de {name} en {skinfolds.siteCodes.length} pliegues:{' '}
          <span className="font-semibold tabular-nums">
            {formatNumber(skinfolds.temAbs, 'measurementError')} mm (
            {formatNumber(skinfolds.temRelPct, 'measurementError')} %)
          </span>
          , CMD95{' '}
          <span className="font-semibold tabular-nums">
            {formatNumber(skinfolds.mdc95, 'measurementError')} mm
          </span>{' '}
          <MethodBadge label={methodLabel(skinfolds.methodCode)} code={skinfolds.methodCode} />
        </p>
      ) : null}
    </section>
  );
}

const ORGANIZATION_LEE = 'ORGANIZATION';

/** Recalcular (RN-D08), con el coeficiente de Lee de la organización u otro (RN-D11), y enmendar con motivo (RN-C07). */
function EvaluationActions({
  evaluationId,
  patientId,
}: {
  evaluationId: string;
  patientId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [amending, setAmending] = useState(false);
  const [reason, setReason] = useState('');
  const [lee, setLee] = useState(ORGANIZATION_LEE);
  const recalculate = useMutation({
    mutationFn: () =>
      apiFetch<RecalculateResponse>(`/evaluations/${evaluationId}/recalculate`, {
        method: 'POST',
        body: lee === ORGANIZATION_LEE ? {} : { leeReferenceGroupCoefficient: Number(lee) },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['evaluation-results', evaluationId], data);
    },
  });
  const amend = useMutation({
    mutationFn: () =>
      apiFetch<EvaluationResponse>(`/evaluations/${evaluationId}/amendments`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: (revision) => {
      router.push(`/panel/pacientes/${patientId}/evaluaciones/${revision.id}`);
    },
  });
  const tooShort = reason.trim().length < 10;

  return (
    <section aria-labelledby="acciones-titulo" className="flex flex-col gap-3">
      <h2 id="acciones-titulo" className="text-lg font-semibold">
        Cambios
      </h2>
      <p className="text-sm text-muted-foreground">
        Una evaluación cerrada no se edita: se enmienda con motivo y lo anterior queda como
        histórico (RN-C07). Recalcular usa los métodos y versiones de hoy; si nada cambió, no crea
        nada (RN-D08).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setAmending(true);
          }}
        >
          Enmendar
        </Button>
        <div className="w-full sm:w-80">
          <Select
            label="Coeficiente de Lee al recalcular"
            hint="RN-D11: el valor usado queda en los insumos del resultado."
            value={lee}
            onValueChange={setLee}
            options={[
              { value: ORGANIZATION_LEE, label: 'El de la organización' },
              ...LEE_REFERENCE_GROUP_COEFFICIENTS.map((coefficient) => ({
                value: String(coefficient),
                label:
                  coefficient === 0
                    ? '0'
                    : `${coefficient > 0 ? '+' : '−'}${Math.abs(coefficient).toFixed(1)}`,
              })),
            ]}
          />
        </div>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" disabled={recalculate.isPending}>
              Recalcular
            </Button>
          }
          title="Recalcular los resultados"
          description="Se crean resultados nuevos con los métodos y versiones vigentes; los anteriores quedan como reemplazados. Si nada cambió, no se crea nada."
          confirmLabel="Recalcular"
          onConfirm={() => {
            recalculate.mutate();
          }}
        />
      </div>
      <FormError error={recalculate.error} title="No se pudo recalcular" />
      {recalculate.data ? (
        <Notice
          tone="success"
          title={
            recalculate.data.created === 0
              ? 'Nada cambió: los resultados ya estaban al día.'
              : `Se crearon ${String(recalculate.data.created)} resultados; ${String(recalculate.data.superseded)} quedaron como reemplazados.`
          }
        />
      ) : null}
      {amending ? (
        <form
          noValidate
          className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooShort) amend.mutate();
          }}
        >
          <TextAreaField
            label="Motivo de la enmienda"
            hint="De 10 a 500 caracteres. Se abre una revisión en borrador con las mismas tomas."
            maxLength={500}
            value={reason}
            error={
              reason !== '' && tooShort ? 'Explica el motivo en al menos 10 caracteres.' : undefined
            }
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <FormError error={amend.error} title="No se pudo enmendar" />
          <div className="flex gap-2">
            <Button type="submit" disabled={tooShort || amend.isPending}>
              {amend.isPending ? 'Creando…' : 'Crear la revisión'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAmending(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
