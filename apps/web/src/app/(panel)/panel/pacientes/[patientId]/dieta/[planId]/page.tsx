import type { NutritionPlan } from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PLAN_STATUS_LABELS, PLAN_STATUS_TONES } from '@/features/nutrition-plan/labels';
import { PlanEditor } from '@/features/nutrition-plan/plan-editor';
import { PlanView } from '@/features/nutrition-plan/plan-view';
import { RevisePlanButton } from '@/features/nutrition-plan/revise-plan-button';
import { Section } from '@/features/patients/section';
import { getOrganization, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { formatDate, formatInstant } from '@/lib/dates';

export const metadata: Metadata = { title: 'Plan nutricional' };

/**
 * Un plan nutricional (RF-19, RF-23): el borrador se edita en tres pasos; lo publicado se lee de su snapshot y, para
 * cambiarlo, se crea una versión nueva (RN-E15).
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
    return (
      <Section
        title="Plan nutricional"
        description={`Borrador de la versión ${String(current.versionNo)}. Dieta por intercambios.`}
      >
        {back}
        <PlanEditor initial={current} patientId={patientId} patientSex={patient.data.sex} />
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
      <p>
        <StatusBadge tone={PLAN_STATUS_TONES[current.status]}>
          {PLAN_STATUS_LABELS[current.status]}
        </StatusBadge>
      </p>
      {patient.data.status === 'ARCHIVED' ? null : (
        <RevisePlanButton patientId={patientId} planId={current.id} />
      )}
      <PlanView plan={current} />
    </Section>
  );
}
