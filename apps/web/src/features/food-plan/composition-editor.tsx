'use client';

import type {
  CompositionNutritionPlan,
  CompositionPlanPreview,
  UpdateCompositionPlan,
} from '@nutricoach/contracts';
import { formatNumber, Notice } from '@nutricoach/ui';
import { useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { sharePctOf } from '@/features/nutrition-plan/draft';
import { DraftPanel, HydrationCard, TargetsCard } from '@/features/nutrition-plan/plan-parts';
import { usePlanDraft } from '@/features/nutrition-plan/use-plan-draft';
import { useCanWrite } from '@/features/session/panel-session';
import {
  compositionBody,
  compositionDraftOf,
  MAX_COMPOSITION_ITEMS,
  withCompositionItems,
  withCompositionMeal,
  withHeaderChange,
  withoutCompositionMeal,
  type CompositionDraft,
  type FoodItemRow,
  type Measures,
} from './draft';
import { AddItems, ItemList } from './item-list';
import { mealLabel, MealHeadersTable } from './meal-headers';
import { FoodAdequacyTable, MacroSummary, NutrientTables } from './plan-totals';

/**
 * Editor del borrador de una dieta por composición (RF-20): metas, hidratación, tiempos de comida con sus alimentos en
 * gramos o medidas caseras (RN-E12) y lo que aporta cada tiempo y el día (RN-E16). Mientras se escribe, la API calcula
 * con el motor y la adecuación se ve en vivo (RN-E10); nada se guarda hasta «Guardar borrador».
 */
export function CompositionEditor({
  initial,
  patientId,
  patientSex,
  measures,
}: {
  initial: CompositionNutritionPlan;
  patientId: string;
  patientSex: 'M' | 'F';
  measures: Measures;
}) {
  const canWrite = useCanWrite();
  const disabled = !canWrite;
  const [draft, setDraft] = useState(() => compositionDraftOf(initial, measures));
  const change = (update: (draft: CompositionDraft) => CompositionDraft) => {
    setDraft(update);
  };
  const body = compositionBody(draft);
  const editor = usePlanDraft<
    CompositionNutritionPlan,
    CompositionPlanPreview,
    UpdateCompositionPlan
  >(initial, body, compositionBody(compositionDraftOf(initial)));
  const { plan, dirty } = editor;
  const calculation: CompositionPlanPreview = editor.preview ?? plan;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <TargetsCard
          targets={plan.targets}
          patientId={patientId}
          energyPrescriptionId={plan.energyPrescriptionId}
        />
        <HydrationCard
          value={draft.hydrationMl}
          patientSex={patientSex}
          disabled={disabled}
          onChange={(value) => {
            change((d) => ({ ...d, hydrationMl: value }));
          }}
        />

        <section aria-labelledby="tiempos-titulo" className="flex flex-col gap-3">
          <h3 id="tiempos-titulo" className="text-base font-semibold">
            Tiempos de comida
          </h3>
          <MealHeadersTable
            meals={draft.meals}
            disabled={disabled}
            onChange={(key, header) => {
              change((d) => withHeaderChange(d, key, header));
            }}
            onAdd={() => {
              change((d) => withCompositionMeal(d, crypto.randomUUID()));
            }}
            onRemove={(key) => {
              change((d) => withoutCompositionMeal(d, key));
            }}
          />
        </section>

        <section aria-labelledby="alimentos-titulo" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 id="alimentos-titulo" className="text-base font-semibold">
              Alimentos por tiempo
            </h3>
            <p className="text-sm text-muted-foreground">
              En gramos de parte comestible y en el estado del alimento: el arroz cocido va en
              gramos de arroz cocido (RN-E12).
            </p>
          </div>
          {draft.meals.map((meal, index) => {
            const name = mealLabel(meal, index);
            const share = sharePctOf(meal.sharePct);
            const totals = calculation.meals[index]?.totals;
            return (
              <section
                key={meal.key}
                aria-labelledby={`comida-${meal.key}`}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 id={`comida-${meal.key}`} className="font-semibold">
                    {meal.timeOfDay ? `${name} · ${meal.timeOfDay}` : name}
                  </h4>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {share === null ? '' : `${formatNumber(share, 'percent')} % de la meta del día`}
                  </span>
                </div>
                {meal.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin alimentos todavía.</p>
                ) : null}
                <ItemList<FoodItemRow>
                  items={meal.items}
                  context={name}
                  disabled={disabled}
                  onChange={(update) => {
                    change((d) => withCompositionItems(d, meal.key, update));
                  }}
                />
                <AddItems
                  context={name}
                  full={meal.items.length >= MAX_COMPOSITION_ITEMS}
                  allowRecipes={false}
                  disabled={disabled}
                  onAdd={(row) => {
                    if (row.kind !== 'FOOD') return;
                    change((d) => withCompositionItems(d, meal.key, (items) => [...items, row]));
                  }}
                />
                {totals && meal.items.length > 0 ? (
                  <div aria-busy={!editor.upToDate}>
                    <MacroSummary totals={totals} label={`Lo que aporta ${name}`} />
                  </div>
                ) : null}
              </section>
            );
          })}
        </section>

        <section aria-labelledby="dia-titulo" className="flex flex-col gap-3">
          <h3 id="dia-titulo" className="text-base font-semibold">
            Lo que aporta el día
          </h3>
          <div aria-busy={!editor.upToDate}>
            <NutrientTables
              totals={calculation.totals}
              nutrients={calculation.nutrients}
              valueLabel="Día"
              caption="Día"
            />
          </div>
        </section>

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
            <FoodAdequacyTable
              targets={calculation.targets}
              adequacy={calculation.adequacy}
              planned={(code) =>
                calculation.totals.nutrients[code] ?? { value: 0, known: 0, missing: 0 }
              }
              plannedLabel="Plan"
              of={calculation.totals.ingredientCount}
              methods={calculation.methods}
            />
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
          problems={calculation.publishProblems}
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
