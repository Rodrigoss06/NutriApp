'use client';

import type {
  UpdateWeeklyMenuPlan,
  WeeklyMenuNutritionPlan,
  WeeklyMenuPlanPreview,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice } from '@nutricoach/ui';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { formatTotalWithGaps } from '@/features/food/format';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { DraftPanel, HydrationCard, TargetsCard } from '@/features/nutrition-plan/plan-parts';
import { usePlanDraft } from '@/features/nutrition-plan/use-plan-draft';
import { useCanWrite } from '@/features/session/panel-session';
import { DayTabs, dayPanelId, dayTabId } from './day-tabs';
import {
  DAY_NAMES,
  MAX_OPTION_ITEMS,
  menuBody,
  menuDraftOf,
  withCellItems,
  withDayCopiedToAll,
  withHeaderChange,
  withMenuMeal,
  withoutMenuMeal,
  type MenuDraft,
  type MenuOption,
  type Measures,
} from './draft';
import { AddItems, ItemList } from './item-list';
import { mealLabel, MealHeadersTable } from './meal-headers';
import { FoodAdequacyTable, MacroSummary, NutrientTables, WeekTable } from './plan-totals';

const OPTIONS: readonly { readonly key: MenuOption; readonly label: string }[] = [
  { key: 'optionA', label: 'Opción A' },
  { key: 'optionB', label: 'Opción B' },
];

/**
 * Editor del borrador de un menú semanal (RF-21): metas, hidratación, los tiempos de comida de toda la semana y, día por
 * día, cada tiempo con su opción A y, si se quiere, una B, con alimentos o recetas (RN-E16). El día suma la opción A de
 * cada tiempo; la adecuación es la del promedio de la semana (RN-E10). Nada se guarda hasta «Guardar borrador».
 */
export function MenuEditor({
  initial,
  patientId,
  patientSex,
  measures,
}: {
  initial: WeeklyMenuNutritionPlan;
  patientId: string;
  patientSex: 'M' | 'F';
  measures: Measures;
}) {
  const canWrite = useCanWrite();
  const disabled = !canWrite;
  const [draft, setDraft] = useState(() => menuDraftOf(initial, measures));
  const [day, setDay] = useState(0);
  const change = (update: (draft: MenuDraft) => MenuDraft) => {
    setDraft(update);
  };
  const body = menuBody(draft);
  const editor = usePlanDraft<WeeklyMenuNutritionPlan, WeeklyMenuPlanPreview, UpdateWeeklyMenuPlan>(
    initial,
    body,
    menuBody(menuDraftOf(initial)),
  );
  const { plan, dirty } = editor;
  const calculation: WeeklyMenuPlanPreview = editor.preview ?? plan;
  const dayName = DAY_NAMES[day] ?? '';
  const today = calculation.days[day];
  const cells = draft.days[day]?.cells ?? [];

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
          <div className="flex flex-col gap-1">
            <h3 id="tiempos-titulo" className="text-base font-semibold">
              Tiempos de comida
            </h3>
            <p className="text-sm text-muted-foreground">Los mismos de lunes a domingo.</p>
          </div>
          <MealHeadersTable
            meals={draft.meals}
            disabled={disabled}
            onChange={(key, header) => {
              change((d) => withHeaderChange(d, key, header));
            }}
            onAdd={() => {
              change((d) => withMenuMeal(d, crypto.randomUUID()));
            }}
            onRemove={(key) => {
              change((d) => withoutMenuMeal(d, key));
            }}
          />
        </section>

        <section aria-labelledby="semana-titulo" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 id="semana-titulo" className="text-base font-semibold">
              Menú de la semana
            </h3>
            <p className="text-sm text-muted-foreground">
              Cada tiempo lleva una opción A y, si quieres, una B para cambiar. El día suma la
              opción A; la B muestra lo suyo para comparar.
            </p>
          </div>
          <DayTabs
            prefix="menu"
            label="Días del menú"
            selected={day}
            onSelect={setDay}
            hint={(d) => {
              const totals = calculation.days[d]?.totals;
              const kcal = totals?.nutrients.ENERC_KCAL;
              return totals && kcal
                ? formatTotalWithGaps(kcal, totals.ingredientCount, 'ENERC_KCAL', 'kcal').text
                : null;
            }}
          />
          <div
            role="tabpanel"
            id={dayPanelId('menu', day)}
            aria-labelledby={dayTabId('menu', day)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">{dayName}</h4>
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="secondary" disabled={disabled}>
                    <Copy aria-hidden className="size-4" />
                    Copiar el {dayName.toLowerCase()} a los demás días
                  </Button>
                }
                title={`¿Copiar el ${dayName.toLowerCase()} a los otros seis días?`}
                description="Lo que tienen los otros días se reemplaza. Puedes cambiar cada día después."
                confirmLabel="Copiar"
                onConfirm={() => {
                  change((d) => withDayCopiedToAll(d, day, () => crypto.randomUUID()));
                }}
              />
            </div>
            {draft.meals.map((meal, m) => {
              const name = mealLabel(meal, m);
              const cell = cells[m];
              const totals = today?.meals[m];
              return (
                <section
                  key={meal.key}
                  aria-labelledby={`celda-${meal.key}`}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <h5 id={`celda-${meal.key}`} className="font-semibold">
                    {meal.timeOfDay ? `${name} · ${meal.timeOfDay}` : name}
                  </h5>
                  <div className="flex flex-col divide-y divide-border">
                    {OPTIONS.map((option) => {
                      const items = cell?.[option.key] ?? [];
                      const context = `${name} del ${dayName.toLowerCase()}, ${option.label.toLowerCase()}`;
                      const optionTotals =
                        option.key === 'optionA' ? totals?.totalsA : totals?.totalsB;
                      return (
                        <div
                          key={option.key}
                          className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
                        >
                          <p className="text-sm font-medium">{option.label}</p>
                          {items.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {option.key === 'optionA'
                                ? 'Sin nada todavía: hace falta para publicar.'
                                : 'Opcional.'}
                            </p>
                          ) : null}
                          <ItemList
                            items={items}
                            context={context}
                            disabled={disabled}
                            onChange={(update) => {
                              change((d) => withCellItems(d, day, m, option.key, update));
                            }}
                          />
                          <AddItems
                            context={context}
                            full={items.length >= MAX_OPTION_ITEMS}
                            allowRecipes
                            disabled={disabled}
                            onAdd={(row) => {
                              change((d) =>
                                withCellItems(d, day, m, option.key, (current) => [
                                  ...current,
                                  row,
                                ]),
                              );
                            }}
                          />
                          {optionTotals && items.length > 0 ? (
                            <div aria-busy={!editor.upToDate}>
                              <MacroSummary
                                totals={optionTotals}
                                label={`Lo que aporta ${context}`}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {today ? (
              <section
                aria-labelledby="dia-titulo"
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <h5 id="dia-titulo" className="font-semibold">
                  Lo que aporta el {dayName.toLowerCase()} con la opción A
                </h5>
                <div aria-busy={!editor.upToDate}>
                  <MacroSummary totals={today.totals} label={`Lo que aporta el ${dayName}`} />
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-brand-text">
                    Ver todos los nutrientes del {dayName.toLowerCase()}
                  </summary>
                  <div className="pt-3">
                    <NutrientTables
                      totals={today.totals}
                      nutrients={calculation.nutrients}
                      valueLabel={dayName}
                      caption={dayName}
                    />
                  </div>
                </details>
              </section>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="resumen-titulo" className="flex flex-col gap-3">
          <h3 id="resumen-titulo" className="text-base font-semibold">
            Resumen de la semana
          </h3>
          <div aria-busy={!editor.upToDate}>
            <WeekTable
              days={calculation.days.map((d) => d.totals)}
              weeklyAverage={calculation.weeklyAverage}
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
            Adecuación del promedio semanal
          </h3>
          <div aria-busy={!editor.upToDate}>
            <FoodAdequacyTable
              targets={calculation.targets}
              adequacy={calculation.adequacy}
              planned={(code) => {
                const average = calculation.weeklyAverage[code];
                return average
                  ? { value: average.value, known: average.known, missing: average.missingDays }
                  : { value: 0, known: 0, missing: 0 };
              }}
              plannedLabel="Promedio"
              of={calculation.days.length}
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
