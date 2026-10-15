import type { EvaluationComparisonResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ComparisonView } from '@/features/assessment/comparison-view';
import { evaluationTitle } from '@/features/assessment/labels';
import { getEvaluations, getSites } from '@/features/assessment/server';
import { getOrganization, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { formatInstant } from '@/lib/dates';

export const metadata: Metadata = { title: 'Comparación' };

/**
 * Comparación con otra evaluación cerrada (RF-15, RN-C06): por defecto, la anterior con antropometría; ?con= elige otra.
 */
export default async function ComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string; evaluationId: string }>;
  searchParams: Promise<{ con?: string }>;
}) {
  const [{ patientId, evaluationId }, { con }] = await Promise.all([params, searchParams]);
  const other = con && /^[0-9a-f-]{36}$/i.test(con) ? `?with=${con}` : '';
  const [patient, comparison, sites, organization, evaluations] = await Promise.all([
    getPatient(patientId),
    serverApi<EvaluationComparisonResponse>(
      `/evaluations/${encodeURIComponent(evaluationId)}/comparison${other}`,
    ),
    getSites(),
    getOrganization(),
    getEvaluations(patientId),
  ]);
  if (!patient.ok) return null;
  const back = `/panel/pacientes/${patientId}/evaluaciones/${evaluationId}`;
  if (!comparison.ok || !sites.ok || !organization.ok) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="warning" title="No se pudo comparar esta evaluación" />
        <Link href={back} className="text-sm text-brand-text underline">
          Volver a la evaluación
        </Link>
      </div>
    );
  }
  const timezone = organization.data.timezone;
  const choices = evaluations.ok
    ? evaluations.data.evaluations.filter(
        (e) => e.id !== evaluationId && e.status === 'CLOSED' && e.kind !== 'BIA',
      )
    : [];
  return (
    <section aria-labelledby="comparacion-titulo" className="flex flex-col gap-4">
      <Link href={back} className="text-sm text-brand-text underline">
        Volver a la evaluación
      </Link>
      <h2 id="comparacion-titulo" className="text-xl font-semibold">
        Comparación con la evaluación anterior
      </h2>
      {choices.length > 1 ? (
        <nav aria-label="Comparar con otra evaluación" className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">Comparar con:</span>
          {choices.map((e) => (
            <Link
              key={e.id}
              href={`?con=${e.id}`}
              aria-current={comparison.data.previous?.id === e.id ? 'page' : undefined}
              className="underline aria-[current=page]:font-semibold"
            >
              {formatInstant(e.measuredAt, timezone)} · {evaluationTitle(e)}
            </Link>
          ))}
        </nav>
      ) : null}
      <ComparisonView comparison={comparison.data} sites={sites.data.sites} timezone={timezone} />
    </section>
  );
}
