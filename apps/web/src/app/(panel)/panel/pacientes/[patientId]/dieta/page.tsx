import type { NutritionPlanListResponse } from '@nutricoach/contracts';
import { Button, EmptyState, formatNumber, Notice, StatusBadge } from '@nutricoach/ui';
import { Salad } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PLAN_MODALITY_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_TONES,
} from '@/features/nutrition-plan/labels';
import { Section } from '@/features/patients/section';
import { getOrganization, getPatient } from '@/features/patients/server';
import { TableScroll } from '@/features/shell/table-scroll';
import { serverApi } from '@/lib/api/server';
import { formatDate, formatInstant } from '@/lib/dates';

export const metadata: Metadata = { title: 'Dieta' };

/** Los planes nutricionales del paciente con sus versiones, de lo más reciente a lo más antiguo (RF-23). */
export default async function DietPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, plans, organization] = await Promise.all([
    getPatient(patientId),
    serverApi<NutritionPlanListResponse>(
      `/patients/${encodeURIComponent(patientId)}/nutrition-plans`,
    ),
    getOrganization(),
  ]);
  if (!patient.ok) return null;
  if (!plans.ok || !organization.ok) {
    return <Notice tone="danger" title="No pudimos cargar los planes" />;
  }
  const base = `/panel/pacientes/${patientId}/dieta`;
  const list = plans.data.plans;
  return (
    <Section
      title="Dieta"
      description="Planes por intercambios con sus versiones. Un plan publicado no se edita: se crea una versión nueva."
    >
      {patient.data.status === 'ARCHIVED' ? null : (
        <div>
          <Button asChild>
            <Link href={`${base}/nuevo`}>Nuevo plan</Link>
          </Button>
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState
          icon={Salad}
          title="Todavía no hay planes"
          description="Un plan parte de una prescripción energética del paciente."
        />
      ) : (
        <TableScroll label="Planes nutricionales">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Planes nutricionales</caption>
            <thead className="bg-surface text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Versión
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Vale desde
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Meta
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Modalidad
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Creado
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((plan) => (
                <tr key={plan.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`${base}/${plan.id}`} className="text-brand-text underline">
                      Versión {plan.versionNo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusBadge tone={PLAN_STATUS_TONES[plan.status]}>
                      {PLAN_STATUS_LABELS[plan.status]}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2">{plan.validFrom ? formatDate(plan.validFrom) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(plan.targetKcal, 'kcal')} kcal
                  </td>
                  <td className="px-3 py-2">
                    {PLAN_MODALITY_LABELS[plan.modality]}
                    {plan.exchangeListCode === null
                      ? null
                      : ` · ${plan.exchangeListCode} ${plan.exchangeListVersion ?? ''}`}
                  </td>
                  <td className="px-3 py-2">
                    {formatInstant(plan.createdAt, organization.data.timezone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
  );
}
