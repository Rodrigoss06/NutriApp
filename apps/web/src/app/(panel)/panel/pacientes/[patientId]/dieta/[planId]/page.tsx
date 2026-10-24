import type { FoodDetail, NutritionPlan } from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CompositionEditor } from '@/features/food-plan/composition-editor';
import type { Measures } from '@/features/food-plan/draft';
import { MenuEditor } from '@/features/food-plan/menu-editor';
import { CompositionView, MenuView } from '@/features/food-plan/plan-views';
import {
  PLAN_MODALITY_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_TONES,
} from '@/features/nutrition-plan/labels';
import { PlanEditor } from '@/features/nutrition-plan/plan-editor';
import { PlanView } from '@/features/nutrition-plan/plan-view';
import { RevisePlanButton } from '@/features/nutrition-plan/revise-plan-button';
import { Section } from '@/features/patients/section';
import { getOrganization, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { formatDate, formatInstant } from '@/lib/dates';

export const metadata: Metadata = { title: 'Plan nutricional' };

const DESCRIPTIONS: Readonly<Record<NutritionPlan['modality'], string>> = {
  EXCHANGES: 'Dieta por intercambios.',
  COMPOSITION: 'Dieta por composición.',
  WEEKLY_MENU: 'Menú semanal.',
};

/** Los alimentos de un borrador de composición o menú. */
function foodIdsOf(plan: NutritionPlan): string[] {
  if (plan.modality === 'COMPOSITION')
    return plan.meals.flatMap((m) => m.items.map((i) => i.foodId));
  if (plan.modality === 'WEEKLY_MENU') {
    return plan.days.flatMap((day) =>
      day.meals.flatMap((cell) =>
        [...cell.optionA, ...cell.optionB].flatMap((i) =>
          i.itemType === 'FOOD' ? [i.foodId] : [],
        ),
      ),
    );
  }
  return [];
}

/** Las medidas caseras de cada alimento del borrador, para cambiar la cantidad en medidas (RN-E12). */
async function measuresOf(plan: NutritionPlan): Promise<Measures> {
  const ids = [...new Set(foodIdsOf(plan))];
  const foods = await Promise.all(ids.map((id) => serverApi<FoodDetail>(`/foods/${id}`)));
  return Object.fromEntries(
    foods.flatMap((food) =>
      food.ok
        ? [[food.data.id, food.data.measures.map(({ id, name, grams }) => ({ id, name, grams }))]]
        : [],
    ),
  );
}

/**
 * Un plan nutricional (RF-19 a RF-21, RF-23), según su modalidad: el borrador se edita; lo publicado se lee de su
 * snapshot y, para cambiarlo, se crea una versión nueva (RN-E15).
 */
export default async function NutritionPlanPage({
  params,
}: {
  params: Promise<{ patientId: string; planId: string }>;
}) {
  const { patientId, planId } = await params;
  const [patient, plan, organization] = await Promise.all([
    getPatient(patientId),
    serverApi<NutritionPlan>(`/nutrition-plans/${encodeURIComponent(planId)}`),
    getOrganization(),
  ]);
  if (!patient.ok) return null;
  const back = (
    <Link
      href={`/panel/pacientes/${patientId}/dieta`}
      className="text-sm text-brand-text underline"
    >
      Volver a dieta
    </Link>
  );
  if (!plan.ok || plan.data.patientId !== patientId) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="warning" title="No encontramos este plan" />
        {back}
      </div>
    );
  }
  const current = plan.data;
  const timezone = organization.ok ? organization.data.timezone : 'America/Lima';
  if (current.status === 'DRAFT') {
    const sex = patient.data.sex;
    return (
      <Section
        title="Plan nutricional"
        description={`Borrador de la versión ${String(current.versionNo)}. ${DESCRIPTIONS[current.modality]}`}
      >
        {back}
        {current.modality === 'EXCHANGES' ? (
          <PlanEditor initial={current} patientId={patientId} patientSex={sex} />
        ) : current.modality === 'COMPOSITION' ? (
          <CompositionEditor
            initial={current}
            patientId={patientId}
            patientSex={sex}
            measures={await measuresOf(current)}
          />
        ) : (
          <MenuEditor
            initial={current}
            patientId={patientId}
            patientSex={sex}
            measures={await measuresOf(current)}
          />
        )}
      </Section>
    );
  }
  return (
    <Section
      title={`Plan nutricional · versión ${String(current.versionNo)}`}
      description={
        <>
          {current.validFrom ? `Vale desde el ${formatDate(current.validFrom)}` : null}
          {current.publishedAt
            ? ` · publicado el ${formatInstant(current.publishedAt, timezone)}`
            : null}
        </>
      }
    >
      {back}
      <p className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={PLAN_STATUS_TONES[current.status]}>
          {PLAN_STATUS_LABELS[current.status]}
        </StatusBadge>
        <span className="text-sm text-muted-foreground">
          {PLAN_MODALITY_LABELS[current.modality]}
        </span>
      </p>
      {patient.data.status === 'ARCHIVED' ? null : (
        <RevisePlanButton patientId={patientId} planId={current.id} />
      )}
      {current.modality === 'EXCHANGES' ? (
        <PlanView plan={current} />
      ) : current.modality === 'COMPOSITION' ? (
        <CompositionView plan={current} />
      ) : (
        <MenuView plan={current} />
      )}
    </Section>
  );
}
