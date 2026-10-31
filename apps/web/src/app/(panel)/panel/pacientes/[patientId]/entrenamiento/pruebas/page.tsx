import type {
  AthleteProfileResponse,
  FunctionalCatalogResponse,
  FunctionalEvaluationListResponse,
  PhysicalTestSummaryResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getMembers, getOrganization, getPatient } from '@/features/patients/server';
import { FunctionalEvaluationList } from '@/features/training/functional-evaluation-list';
import { NewFunctionalEvaluation } from '@/features/training/new-functional-evaluation';
import { PhysicalSummaryTable } from '@/features/training/physical-summary-table';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Pruebas físicas' };

/** Las pruebas físicas del paciente, por momento (RF-41, 07 §4). Leerlas deja un READ en la auditoría (RN-B03). */
export default async function PhysicalTestsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const id = encodeURIComponent(patientId);
  const [patient, evaluations, summary, catalog, profile, members, organization] =
    await Promise.all([
      getPatient(patientId),
      serverApi<FunctionalEvaluationListResponse>(
        `/patients/${id}/functional-evaluations?kind=FITNESS`,
      ),
      serverApi<PhysicalTestSummaryResponse>(`/patients/${id}/physical-test-summary`),
      serverApi<FunctionalCatalogResponse>('/functional-evaluations/catalog'),
      serverApi<AthleteProfileResponse>(`/patients/${id}/athlete-profile`),
      getMembers(),
      getOrganization(),
    ]);
  if (!patient.ok) return null;
  if (
    !evaluations.ok ||
    !summary.ok ||
    !catalog.ok ||
    !profile.ok ||
    !members.ok ||
    !organization.ok
  ) {
    return <Notice tone="danger" title="No pudimos cargar las pruebas físicas" />;
  }
  const base = `/panel/pacientes/${patientId}/entrenamiento/pruebas`;
  const list = evaluations.data.evaluations;
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Pruebas físicas"
        description="15 pruebas por momento: inicial, semanas 4, 8 y 12, y retest. Solo cuentan las evaluaciones cerradas. Cambio = semana 12 − inicial."
      >
        <PhysicalSummaryTable
          summary={summary.data.tests}
          tests={catalog.data.physicalTests}
          targets={profile.data.current?.testTargets ?? {}}
        />
      </Section>
      <Section title="Evaluaciones de pruebas físicas">
        <NewFunctionalEvaluation
          patientId={patientId}
          kind="FITNESS"
          careTeam={patient.data.careTeam}
          members={members.data.members}
          archived={patient.data.status === 'ARCHIVED'}
          base={base}
        />
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay evaluaciones.</p>
        ) : (
          <FunctionalEvaluationList
            caption="Evaluaciones de pruebas físicas"
            evaluations={list}
            members={members.data.members}
            timezone={organization.data.timezone}
            base={base}
          />
        )}
      </Section>
    </div>
  );
}
