'use client';

import {
  FIXED_GROUPS,
  type ExchangeGroupCode,
  type ExchangeNutritionPlan,
  type ExchangePlanPreview,
  type UpdateExchangePlan,
} from '@nutricoach/contracts';
import { Button, formatNumber, Notice, Steps } from '@nutricoach/ui';
import { useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { CellInput } from './cell-input';
import { draftOf, planBody, servingsOf, without, type PlanDraft } from './draft';
import { MealsStep } from './editor-meals';
import { DraftPanel, HydrationCard, TargetsCard } from './plan-parts';
import { AdequacyTable, ExchangeTable } from './plan-tables';
import { usePlanDraft } from './use-plan-draft';

const STEPS = [
  { id: 'metas', label: 'Metas' },
  { id: 'intercambios', label: 'Intercambios' },
  { id: 'reparto', label: 'Reparto y alimentos' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const isFixed = (code: ExchangeGroupCode): code is (typeof FIXED_GROUPS)[number] =>
  (FIXED_GROUPS as readonly string[]).includes(code);

/** Lo que se muestra calculado: lo guardado, o la vista previa de lo que se está escribiendo. */
type Calculation = ExchangePlanPreview;

function GoalsStep({
  plan,
  patientId,
  patientSex,
  draft,
  change,
  disabled,
}: {
  plan: ExchangeNutritionPlan;
  patientId: string;
  patientSex: 'M' | 'F';
  draft: PlanDraft;
  change: (update: (draft: PlanDraft) => PlanDraft) => void;
  disabled: boolean;
}) {
  const { exchangeList } = plan;
  return (
    <div className="flex flex-col gap-6">
      <TargetsCard
        targets={plan.targets}
        patientId={patientId}
        energyPrescriptionId={plan.energyPrescriptionId}
      />

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

      <HydrationCard
        value={draft.hydrationMl}
        patientSex={patientSex}
        disabled={disabled}
        onChange={(value) => {
          change((d) => ({ ...d, hydrationMl: value }));
        }}
      />
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
  plan: ExchangeNutritionPlan;
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
  initial: ExchangeNutritionPlan;
  patientId: string;
  patientSex: 'M' | 'F';
}) {
  const canWrite = useCanWrite();
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [step, setStep] = useState<StepId>('metas');
  const change = (update: (draft: PlanDraft) => PlanDraft) => {
    setDraft(update);
  };

  const body = planBody(draft);
  const editor = usePlanDraft<ExchangeNutritionPlan, ExchangePlanPreview, UpdateExchangePlan>(
    initial,
    body,
    planBody(draftOf(initial)),
  );
  const { plan, dirty } = editor;
  const calculation: Calculation = editor.preview ?? plan;

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
        className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4"
      >
        <section aria-labelledby="adecuacion-titulo" className="flex flex-col gap-3">
          <h3 id="adecuacion-titulo" className="text-base font-semibold">
            Adecuación
          </h3>
          <div aria-busy={!editor.upToDate}>
            <AdequacyTable calculation={calculation} />
          </div>
          {dirty && body === null ? (
            <Notice tone="warning" title="Revisa los campos marcados">
              La adecuación se actualiza cuando todos los campos tienen un valor válido.
            </Notice>
          ) : null}
          {editor.previewError ? (
            <FormError error={editor.previewError} title="Así no se puede guardar" />
          ) : null}
        </section>

        <DraftPanel
          versionNo={plan.versionNo}
          dirty={dirty}
          invalid={body === null}
          disabled={disabled}
          problems={problems}
          saving={editor.save.isPending}
          saveError={editor.save.error}
          onSave={() => {
            if (body) editor.save.mutate(body);
          }}
          publishing={editor.publish.isPending}
          publishError={editor.publish.error}
          onPublish={() => {
            editor.publish.mutate();
          }}
        />
      </aside>
    </div>
  );
}
