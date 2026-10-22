'use client';

import {
  FIXED_GROUPS,
  methodLabel,
  type ExchangeGroupCode,
  type NutritionPlan,
  type NutritionPlanPreview,
  type UpdateNutritionPlan,
} from '@nutricoach/contracts';
import {
  Button,
  ConfirmDialog,
  formatNumber,
  MethodBadge,
  Notice,
  StatusBadge,
  Steps,
} from '@nutricoach/ui';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';
import { CellInput } from './cell-input';
import { draftOf, hydrationOf, planBody, servingsOf, without, type PlanDraft } from './draft';
import { MealsStep } from './editor-meals';
import { AdequacyTable, ExchangeTable } from './plan-tables';
import { hydrationReferences } from './portion';

const STEPS = [
  { id: 'metas', label: 'Metas' },
  { id: 'intercambios', label: 'Intercambios' },
  { id: 'reparto', label: 'Reparto y alimentos' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const ML = new Intl.NumberFormat('es-PE');
/** Un plan nuevo tiene un pendiente por grupo y tiempo: se ven los primeros y el resto se despliega. */
const SHOWN_PROBLEMS = 3;
const isFixed = (code: ExchangeGroupCode): code is (typeof FIXED_GROUPS)[number] =>
  (FIXED_GROUPS as readonly string[]).includes(code);

/** Lo que se muestra calculado: lo guardado, o la vista previa de lo que se está escribiendo. */
type Calculation = NutritionPlanPreview;

function GoalsStep({
  plan,
  patientId,
  patientSex,
  draft,
  change,
  disabled,
}: {
  plan: NutritionPlan;
  patientId: string;
  patientSex: 'M' | 'F';
  draft: PlanDraft;
  change: (update: (draft: PlanDraft) => PlanDraft) => void;
  disabled: boolean;
}) {
  const { targets, exchangeList } = plan;
  const hydration = hydrationOf(draft.hydrationMl);
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="metas-titulo"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <h3 id="metas-titulo" className="font-semibold">
          Metas del día
        </h3>
        <MethodBadge label={methodLabel('MACROS_PROTEIN_FIRST')} code="MACROS_PROTEIN_FIRST" />
        <dl className="grid gap-2 sm:grid-cols-4">
          {(
            [
              ['Energía', targets.kcal, 'kcal', 'kcal'],
              ['Carbohidratos', targets.choG, 'grams', 'g'],
              ['Proteína', targets.proteinG, 'grams', 'g'],
              ['Grasa', targets.fatG, 'grams', 'g'],
            ] as const
          ).map(([label, value, kind, unit]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatNumber(value, kind)} {unit}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Salen de la prescripción energética, sin redondear (RF-18).{' '}
          <Link
            href={`/panel/pacientes/${patientId}/energia/${plan.energyPrescriptionId}`}
            className="text-brand-text underline"
          >
            Ver la prescripción
          </Link>
        </p>
      </section>

      <section
        aria-labelledby="lista-titulo"
        className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
      >
        <h3 id="lista-titulo" className="font-semibold">
          Lista de intercambio
        </h3>
        <p className="text-sm">
          {exchangeList.name} · versión {exchangeList.version}. El plan sigue con esta versión
          aunque se publique otra (RN-E11).
        </p>
        {exchangeList.provisional ? (
          <Notice tone="warning" title="Lista provisional">
            Sus valores son de ejemplo mientras se confirma el permiso de la lista oficial.
          </Notice>
        ) : null}
      </section>

      <section
        aria-labelledby="hidratacion-titulo"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <h3 id="hidratacion-titulo" className="font-semibold">
          Hidratación
        </h3>
        <div className="max-w-xs">
          <TextField
            label="Meta de hidratación (ml por día)"
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            value={draft.hydrationMl}
            error={hydration === undefined ? 'Un entero de 1 a 10000 ml.' : undefined}
            hint="Hace falta para publicar (RN-E13)."
            onChange={(event) => {
              const value = event.target.value;
              change((d) => ({ ...d, hydrationMl: value }));
            }}
          />
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            Ingesta adecuada de agua total para {patientSex === 'F' ? 'mujeres' : 'hombres'}{' '}
            adultos, con el agua de los alimentos. Es una referencia: la meta la decides tú.
          </p>
          <ul className="flex flex-wrap gap-2">
            {hydrationReferences(patientSex).map((reference) => (
              <li key={reference.source}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    change((d) => ({ ...d, hydrationMl: String(reference.ml) }));
                  }}
                >
                  Usar {ML.format(reference.ml)} ml ({reference.source})
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function ExchangesStep({
  plan,
  calculation,
  draft,
  change,
  disabled,
}: {
  plan: NutritionPlan;
  calculation: Calculation;
  draft: PlanDraft;
  change: (update: (draft: PlanDraft) => PlanDraft) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Verduras, frutas y lácteos los decides tú. Almidones, carnes y grasas los despeja el método
        para acercarse a las metas; puedes ajustarlos a mano (RN-E08).
      </p>
      <ExchangeTable
        groups={plan.exchangeList.groups}
        calculation={calculation}
        renderServings={(code) => {
          const name = plan.exchangeList.groups.find((g) => g.code === code)?.name ?? code;
          if (isFixed(code)) {
            const text = draft.fixed[code];
            return (
              <CellInput
                label={`${name}: intercambios por día`}
                inputMode="numeric"
                disabled={disabled}
                value={text}
                error={servingsOf(text) === null ? 'Entero de 0 a 99.' : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  change((d) => ({ ...d, fixed: { ...d.fixed, [code]: value } }));
                }}
              />
            );
          }
          const solved = code;
          const exchange = calculation.exchanges.find((e) => e.groupCode === code);
          const override = draft.overrides[solved];
          if (override === undefined) {
            return (
              <span className="flex flex-col items-end gap-1">
                <span>{formatNumber(exchange?.automatic, 'exchanges')}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Ajustar ${name} a mano`}
                  disabled={disabled}
                  onClick={() => {
                    change((d) => ({
                      ...d,
                      overrides: { ...d.overrides, [solved]: String(exchange?.automatic ?? 0) },
                    }));
                  }}
                >
                  Ajustar
                </Button>
              </span>
            );
          }
          return (
            <span className="flex flex-col items-end gap-1">
              <CellInput
                label={`${name}: intercambios por día, a mano`}
                inputMode="numeric"
                disabled={disabled}
                value={override}
                error={servingsOf(override) === null ? 'Entero de 0 a 99.' : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  change((d) => ({ ...d, overrides: { ...d.overrides, [solved]: value } }));
                }}
              />
              <span className="text-xs text-muted-foreground">
                El método da {formatNumber(exchange?.automatic, 'exchanges')}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Volver ${name} al método`}
                disabled={disabled}
                onClick={() => {
                  change((d) => ({ ...d, overrides: without(d.overrides, solved) }));
                }}
              >
                Volver al método
              </Button>
            </span>
          );
        }}
      />
    </div>
  );
}

/**
 * Editor del borrador de una dieta por intercambios en tres pasos (RF-19): metas, intercambios, y reparto con los
 * alimentos permitidos. Mientras se escribe, la API calcula con el motor y la adecuación se ve en vivo (RN-E10); nada se
 * guarda hasta «Guardar borrador». Publicar congela el plan (RN-E15) y exige lo que dice publishProblems.
 */
export function PlanEditor({
  initial,
  patientId,
  patientSex,
}: {
  initial: NutritionPlan;
  patientId: string;
  patientSex: 'M' | 'F';
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [plan, setPlan] = useState(initial);
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [saved, setSaved] = useState(() => JSON.stringify(planBody(draftOf(initial))));
  const [step, setStep] = useState<StepId>('metas');
  const change = (update: (draft: PlanDraft) => PlanDraft) => {
    setDraft(update);
  };

  const body = planBody(draft);
  // El texto del cuerpo, no el objeto: se compara por valor y la espera no se reinicia en cada render.
  const key = body === null ? null : JSON.stringify(body);
  const dirty = key !== saved;
  const debouncedKey = useDebounced(key, 300);
  const preview = useQuery({
    queryKey: ['nutrition-plan-preview', plan.id, debouncedKey],
    queryFn: () =>
      apiFetch<NutritionPlanPreview>(`/nutrition-plans/${plan.id}/preview`, {
        method: 'POST',
        body: JSON.parse(debouncedKey ?? 'null') as unknown,
      }),
    enabled: debouncedKey !== null && debouncedKey !== saved,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const calculation: Calculation = dirty && preview.data ? preview.data : plan;
  const upToDate = !dirty || (key === debouncedKey && preview.isSuccess && !preview.isFetching);

  const save = useMutation({
    mutationFn: (payload: UpdateNutritionPlan) =>
      apiFetch<NutritionPlan>(`/nutrition-plans/${plan.id}`, {
        method: 'PUT',
        body: payload,
        headers: { 'If-Match': `"${String(plan.version)}"` },
      }),
    onSuccess: (next, payload) => {
      setPlan(next);
      setSaved(JSON.stringify(payload));
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      apiFetch<NutritionPlan>(`/nutrition-plans/${plan.id}/publish`, {
        method: 'POST',
        headers: { 'If-Match': `"${String(plan.version)}"` },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  const index = STEPS.findIndex((s) => s.id === step);
  const disabled = !canWrite;
  const problems = calculation.publishProblems;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Steps steps={STEPS} currentId={step} label="Pasos del plan" />
        <section
          aria-label={`Paso ${String(index + 1)}: ${STEPS[index]?.label ?? ''}`}
          className="flex flex-col gap-4"
        >
          {step === 'metas' ? (
            <GoalsStep
              plan={plan}
              patientId={patientId}
              patientSex={patientSex}
              draft={draft}
              change={change}
              disabled={disabled}
            />
          ) : null}
          {step === 'intercambios' ? (
            <ExchangesStep
              plan={plan}
              calculation={calculation}
              draft={draft}
              change={change}
              disabled={disabled}
            />
          ) : null}
          {step === 'reparto' ? (
            <>
              <MealsStep
                draft={draft}
                change={change}
                groups={plan.exchangeList.groups}
                calculation={calculation}
                disabled={disabled}
              />
              <TextAreaField
                label="Indicaciones para el paciente"
                hint="Opcional. Hasta 2000 caracteres."
                maxLength={2_000}
                disabled={disabled}
                value={draft.instructions}
                onChange={(event) => {
                  const value = event.target.value;
                  change((d) => ({ ...d, instructions: value }));
                }}
              />
            </>
          ) : null}
        </section>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => {
              setStep(STEPS[index - 1]?.id ?? 'metas');
            }}
          >
            Anterior
          </Button>
          {index < STEPS.length - 1 ? (
            <Button
              variant="secondary"
              onClick={() => {
                setStep(STEPS[index + 1]?.id ?? 'reparto');
              }}
            >
              Siguiente: {STEPS[index + 1]?.label}
            </Button>
          ) : null}
        </div>
      </div>

      <aside
        aria-label="Adecuación y publicación"
        className="flex flex-col gap-4 lg:sticky lg:top-4"
      >
        <section aria-labelledby="adecuacion-titulo" className="flex flex-col gap-3">
          <h3 id="adecuacion-titulo" className="text-base font-semibold">
            Adecuación
          </h3>
          <div aria-busy={!upToDate}>
            <AdequacyTable calculation={calculation} />
          </div>
          {dirty && body === null ? (
            <Notice tone="warning" title="Revisa los campos marcados">
              La adecuación se actualiza cuando todos los campos tienen un valor válido.
            </Notice>
          ) : null}
          {dirty && body !== null && preview.isError ? (
            <FormError error={preview.error} title="Así no se puede guardar" />
          ) : null}
        </section>

        <section
          aria-labelledby="borrador-titulo"
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <h3 id="borrador-titulo" className="font-semibold">
            Borrador · versión {plan.versionNo}
          </h3>
          <p className="text-sm" role="status">
            {dirty ? (
              <StatusBadge tone="warning">Cambios sin guardar</StatusBadge>
            ) : (
              <StatusBadge tone="success">Guardado</StatusBadge>
            )}
          </p>
          <FormError error={save.error} title="No se guardó el borrador" />
          <Button
            disabled={disabled || !dirty || body === null || save.isPending}
            onClick={() => {
              if (body) save.mutate(body);
            }}
          >
            {save.isPending ? 'Guardando…' : 'Guardar borrador'}
          </Button>

          <h4 className="pt-2 font-semibold">Publicar</h4>
          {problems.length > 0 ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>Para publicar falta:</p>
              <ul aria-label="Lo que falta para publicar" className="list-disc pl-5">
                {problems.slice(0, SHOWN_PROBLEMS).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              {problems.length > SHOWN_PROBLEMS ? (
                <details>
                  <summary className="cursor-pointer text-brand-text">
                    Ver {problems.length - SHOWN_PROBLEMS} más
                  </summary>
                  <ul className="list-disc pl-5">
                    {problems.slice(SHOWN_PROBLEMS).map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Al publicar, el plan vale desde hoy y no se edita más; el que estaba vigente queda
              reemplazado (RN-E14, RN-E15).
            </p>
          )}
          {dirty ? (
            <p className="text-sm text-muted-foreground">Guarda los cambios antes de publicar.</p>
          ) : null}
          <FormError error={publish.error} title="No se publicó el plan" />
          <ConfirmDialog
            trigger={
              <Button
                variant="secondary"
                disabled={disabled || dirty || problems.length > 0 || publish.isPending}
              >
                {publish.isPending ? 'Publicando…' : 'Publicar plan'}
              </Button>
            }
            title={`¿Publicar la versión ${String(plan.versionNo)}?`}
            description="Desde hoy será el plan vigente del paciente y aparecerá en su app. Un plan publicado no se edita: para cambiarlo, se crea una versión nueva."
            confirmLabel="Publicar"
            tone="danger"
            onConfirm={() => {
              publish.mutate();
            }}
          />
        </section>
      </aside>
    </div>
  );
}
