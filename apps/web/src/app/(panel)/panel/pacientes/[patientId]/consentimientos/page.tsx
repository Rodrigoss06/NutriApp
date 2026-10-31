import type { ConsentDocumentListResponse, ConsentListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { ConsentsSection } from '@/features/patients/consents-section';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Consentimientos' };

export default async function ConsentsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, consents, documents, members] = await Promise.all([
    getPatient(patientId),
    serverApi<ConsentListResponse>(`/patients/${encodeURIComponent(patientId)}/consents`),
    serverApi<ConsentDocumentListResponse>('/patients/consent-documents'),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!consents.ok || !documents.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar los consentimientos" />;
  }
  return (
    <Section
      title="Consentimientos"
      description="Sin el de datos de salud vigente no se registra ningún dato de salud (RN-B01)."
    >
      <ConsentsSection
        patient={patient.data}
        consents={consents.data.consents}
        documents={documents.data.documents}
        members={members.data.members}
      />
    </Section>
  );
}
