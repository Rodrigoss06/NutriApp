import type { FunctionalEvaluationListResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { PersonStanding } from 'lucide-react';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getMembers, getOrganization, getPatient } from '@/features/patients/server';
import { FunctionalEvaluationList } from '@/features/training/functional-evaluation-list';
import { NewFunctionalEvaluation } from '@/features/training/new-functional-evaluation';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Evaluación postural' };

/** Las evaluaciones posturales del paciente (RF-41, 07 §3.3). Leerlas deja un READ en la auditoría (RN-B03). */
export default async function MovementScreenPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, evaluations, members, organization] = await Promise.all([
    getPatient(patientId),
    serverApi<FunctionalEvaluationListResponse>(
      `/patients/${encodeURIComponent(patientId)}/functional-evaluations?kind=MOVEMENT`,
    ),
    getMembers(),
    getOrganization(),
  ]);
  if (!patient.ok) return null;
  if (!evaluations.ok || !members.ok || !organization.ok) {
    return <Notice tone="danger" title="No pudimos cargar las evaluaciones posturales" />;
  }
  const base = `/panel/pacientes/${patientId}/entrenamiento/postura`;
  const list = evaluations.data.evaluations;
  return (
    <Section
      title="Evaluación postural"
      description="14 pruebas de postura y movimiento. No sirve para diagnosticar lesiones. Cerrada, solo se enmienda."
    >
      <NewFunctionalEvaluation
        patientId={patientId}
        kind="MOVEMENT"
        careTeam={patient.data.careTeam}
        members={members.data.members}
        archived={patient.data.status === 'ARCHIVED'}
        base={base}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={PersonStanding}
          title="Todavía no hay evaluaciones posturales"
          description="Sin evaluación postural la propuesta no se bloquea, pero conviene hacerla antes de prescribir."
        />
      ) : (
        <FunctionalEvaluationList
          caption="Evaluaciones posturales"
          evaluations={list}
          members={members.data.members}
          timezone={organization.data.timezone}
          base={base}
        />
      )}
    </Section>
  );
}
