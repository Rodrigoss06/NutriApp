import type {
  AthleteProfileResponse,
  FunctionalCatalogResponse,
  FunctionalEvaluation,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembers, getPatient } from '@/features/patients/server';
import { FunctionalEvaluationView } from '@/features/training/functional-evaluation-view';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Evaluación postural' };

/** Una evaluación postural, en borrador o cerrada (RF-41, 07 §3.3). Leerla deja un READ en la auditoría (RN-B03). */
export default async function MovementEvaluationPage({
  params,
}: {
  params: Promise<{ patientId: string; evaluationId: string }>;
}) {
  const { patientId, evaluationId } = await params;
  const [patient, evaluation, catalog, profile, members] = await Promise.all([
    getPatient(patientId),
    serverApi<FunctionalEvaluation>(`/functional-evaluations/${encodeURIComponent(evaluationId)}`),
    serverApi<FunctionalCatalogResponse>('/functional-evaluations/catalog'),
    serverApi<AthleteProfileResponse>(`/patients/${encodeURIComponent(patientId)}/athlete-profile`),
    getMembers(),
  ]);
  const base = `/panel/pacientes/${patientId}/entrenamiento/postura`;
  if (!patient.ok) return null;
  if (
    !evaluation.ok ||
    evaluation.data.patientId !== patientId ||
    evaluation.data.kind !== 'MOVEMENT'
  ) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warning" title="No encontramos esta evaluación" />
        <Link href={base} className="text-sm text-brand-text underline">
          Volver a la lista
        </Link>
      </div>
    );
  }
  if (!catalog.ok || !profile.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar la evaluación" />;
  }
  return (
    <FunctionalEvaluationView
      key={evaluation.data.id}
      initial={evaluation.data}
      catalog={catalog.data}
      targets={profile.data.current?.testTargets ?? {}}
      careTeam={patient.data.careTeam}
      members={members.data.members}
      archived={patient.data.status === 'ARCHIVED'}
      base={base}
    />
  );
}
