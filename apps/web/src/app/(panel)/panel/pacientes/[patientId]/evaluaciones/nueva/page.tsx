import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { NewEvaluationForm } from '@/features/assessment/new-evaluation-form';
import { getSites } from '@/features/assessment/server';
import { RecordWriteGate } from '@/features/patients/record-write-gate';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';

export const metadata: Metadata = { title: 'Nueva evaluación' };

/** Nueva evaluación (RF-11): nivel, condiciones y evaluador. Sin consentimiento de datos de salud, 422 (RN-B01). */
export default async function NewEvaluationPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, sites, members] = await Promise.all([
    getPatient(patientId),
    getSites(),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!sites.ok || !members.ok)
    return <Notice tone="danger" title="No pudimos cargar el formulario" />;
  if (patient.data.status === 'ARCHIVED') {
    return <Notice tone="warning" title="Está archivado: no se registran evaluaciones nuevas" />;
  }
  return (
    <RecordWriteGate
      patientId={patientId}
      careTeam={patient.data.careTeam}
      members={members.data.members}
      action="evaluar"
    >
      <Section title="Nueva evaluación">
        <NewEvaluationForm
          patientId={patientId}
          sites={sites.data.sites}
          members={members.data.members}
        />
      </Section>
    </RecordWriteGate>
  );
}
