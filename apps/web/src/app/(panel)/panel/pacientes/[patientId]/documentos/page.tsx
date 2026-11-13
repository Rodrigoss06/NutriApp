import type { RecordDocumentsResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient, patientLabel } from '@/features/patients/server';
import { StaffRecordDocuments } from '@/features/record-documents/staff-record-documents';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Documentos' };

/**
 * El expediente de documentos (P14.5, PR 8b; P-31; RN-G21): pedir un documento o agregarlo ya validado, y validar o devolver con
 * una nota lo que sube el paciente. Ver la lista y descargar un archivo quedan en la auditoría (RN-B03).
 */
export default async function RecordDocumentsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, documents, members, label] = await Promise.all([
    getPatient(patientId),
    serverApi<RecordDocumentsResponse>(
      `/patients/${encodeURIComponent(patientId)}/record-documents`,
    ),
    getMembers(),
    patientLabel(),
  ]);
  if (!patient.ok) return null;
  if (!documents.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar los documentos" />;
  }
  const noun = label.toLowerCase();
  return (
    <Section
      title="Expediente de documentos"
      description={`Enlaces y archivos PDF, JPEG o PNG de hasta 5 MB; los videos, por enlace. Lo que agregas entra validado; lo que sube el ${noun} desde su app queda por revisar.`}
    >
      <StaffRecordDocuments
        patientId={patientId}
        response={documents.data}
        careTeam={patient.data.careTeam}
        members={members.data.members}
        noun={noun}
      />
    </Section>
  );
}
