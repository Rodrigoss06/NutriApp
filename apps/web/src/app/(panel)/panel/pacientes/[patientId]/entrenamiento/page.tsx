import type { TrainingSafetyResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getOrganization, getPatient } from '@/features/patients/server';
import { SafetySummary } from '@/features/training/safety-summary';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Entrenamiento' };

/** Las tres llaves antes de prescribir (RF-41, RN-F15). Leerlas deja un READ en la auditoría (RN-B03). */
export default async function TrainingPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, safety, organization] = await Promise.all([
    getPatient(patientId),
    serverApi<TrainingSafetyResponse>(`/patients/${encodeURIComponent(patientId)}/training-safety`),
    getOrganization(),
  ]);
  if (!patient.ok) return null;
  if (!safety.ok || !organization.ok) {
    return <Notice tone="danger" title="No pudimos cargar la seguridad de entrenamiento" />;
  }
  return (
    <Section
      title="Seguridad antes de prescribir"
      description="Tres llaves: alta médica, dolor y cribado. Mientras una siga cerrada, no se genera ni se publica la propuesta."
    >
      <SafetySummary
        safety={safety.data}
        base={`/panel/pacientes/${patientId}/entrenamiento`}
        timezone={organization.data.timezone}
      />
    </Section>
  );
}
