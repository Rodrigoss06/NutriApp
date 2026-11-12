import type { ProgressPhotosResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { Camera } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient, patientLabel } from '@/features/patients/server';
import { StaffPhotoSlots } from '@/features/training/photo-slots';
import { photoComparison, photoSlots } from '@/features/training/photo-view';
import { PhotoComparison } from '@/features/training/progress-photos';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Fotos de progreso' };

/**
 * Las fotos de progreso (P14.5, PR 6b-2; P-30; RN-G20): la comparativa por vista y las tres fotos de cada mesociclo, que se suben
 * desde su última semana. Solo con el consentimiento propio vigente; al revocarlo o al archivar al paciente, se borran. Cada foto
 * vista queda en la auditoría (RN-B03).
 */
export default async function ProgressPhotosPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, photos, members, label] = await Promise.all([
    getPatient(patientId),
    serverApi<ProgressPhotosResponse>(`/patients/${encodeURIComponent(patientId)}/progress-photos`),
    getMembers(),
    patientLabel(),
  ]);
  if (!patient.ok) return null;
  if (!photos.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar las fotos" />;
  }
  const noun = label.toLowerCase();
  if (!photos.data.consentActive) {
    return (
      <Notice tone="warning" title="Sin el consentimiento de fotos de progreso" rule="RN-G20">
        Las fotos se suben y se ven solo con su consentimiento vigente: lo autoriza el {noun} desde
        su app o lo registras en{' '}
        <Link
          href={`/panel/pacientes/${patientId}/consentimientos`}
          className="text-brand-text underline"
        >
          Consentimientos
        </Link>
        . Si lo revoca o archivas al {noun}, sus fotos se borran.
      </Notice>
    );
  }
  const rows = photoSlots(photos.data);
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Comparativa por vista"
        description="La foto del primer mesociclo frente a la del último, como la hoja."
      >
        <PhotoComparison comparison={photoComparison(photos.data)} audience="staff" />
      </Section>
      <Section
        title="Fotos de cada mesociclo"
        description={`Frontal, lateral y posterior, desde la última semana del mesociclo. Las sube el ${noun} desde su app o tú desde aquí; subir otra la reemplaza.`}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="Sin programa publicado"
            description="Las fotos se suben por cada mesociclo del programa publicado."
          />
        ) : (
          <StaffPhotoSlots
            rows={rows}
            patientId={patientId}
            careTeam={patient.data.careTeam}
            members={members.data.members}
          />
        )}
      </Section>
    </div>
  );
}
