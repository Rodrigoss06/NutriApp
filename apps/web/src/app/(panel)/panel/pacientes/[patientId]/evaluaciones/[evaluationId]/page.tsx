import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EvaluationCapture } from '@/features/assessment/evaluation-capture';
import { EvaluationHeader } from '@/features/assessment/evaluation-header';
import { EvaluationResults } from '@/features/assessment/evaluation-results';
import { getEvaluation, getSites } from '@/features/assessment/server';
import { getMembers, getOrganization, getPatient } from '@/features/patients/server';

export const metadata: Metadata = { title: 'Evaluación' };

/**
 * Una evaluación (RF-11 a RF-15): en borrador, la captura; cerrada o enmendada, sus resultados. Leerla deja un READ en
 * la auditoría (RN-B03).
 */
export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ patientId: string; evaluationId: string }>;
}) {
  const { patientId, evaluationId } = await params;
  const [patient, evaluation, sites, members, organization] = await Promise.all([
    getPatient(patientId),
    getEvaluation(evaluationId),
    getSites(),
    getMembers(),
    getOrganization(),
  ]);
  if (!patient.ok) return null;
  if (!evaluation.ok || evaluation.data.patientId !== patientId) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="warning" title="No encontramos esta evaluación" />
        <Link
          href={`/panel/pacientes/${patientId}/evaluaciones`}
          className="text-sm text-brand-text underline"
        >
          Volver a evaluaciones
        </Link>
      </div>
    );
  }
  if (!sites.ok || !members.ok || !organization.ok) {
    return <Notice tone="danger" title="No pudimos cargar la evaluación" />;
  }
  return (
    <div className="flex flex-col gap-6">
      <EvaluationHeader
        evaluation={evaluation.data}
        members={members.data.members}
        timezone={organization.data.timezone}
        patientId={patientId}
      />
      {evaluation.data.status === 'DRAFT' ? (
        <EvaluationCapture
          key={evaluation.data.id}
          initial={evaluation.data}
          sites={sites.data.sites}
          careTeam={patient.data.careTeam}
          members={members.data.members}
        />
      ) : (
        <EvaluationResults
          key={evaluation.data.id}
          evaluation={evaluation.data}
          sites={sites.data.sites}
          members={members.data.members}
          careTeam={patient.data.careTeam}
          patientId={patientId}
        />
      )}
    </div>
  );
}
