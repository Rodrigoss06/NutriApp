import type { ClinicalHistoryResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { HistoryForm } from '@/features/patients/history-form';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Historia clínica' };

/** Historia clínica versionada (RF-09). Leerla deja un READ en la auditoría (RN-B03). */
export default async function HistoryPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, history, members] = await Promise.all([
    getPatient(patientId),
    serverApi<ClinicalHistoryResponse>(
      `/patients/${encodeURIComponent(patientId)}/clinical-history`,
    ),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!history.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar la historia clínica" />;
  }
  return (
    <Section title="Historia clínica">
      <HistoryForm
        patientId={patientId}
        history={history.data}
        members={members.data.members}
        archived={patient.data.status === 'ARCHIVED'}
      />
    </Section>
  );
}
