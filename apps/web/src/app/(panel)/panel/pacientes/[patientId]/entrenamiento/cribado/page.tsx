import type { ScreeningListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { ScreeningSection } from '@/features/training/screening-section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Cribado previo al ejercicio' };

/** El cribado previo al ejercicio y su revisión (RN-F15, 07 §3.2). Leerlo deja un READ en la auditoría (RN-B03). */
export default async function ScreeningPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, screenings, members] = await Promise.all([
    getPatient(patientId),
    serverApi<ScreeningListResponse>(`/patients/${encodeURIComponent(patientId)}/screenings`),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!screenings.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar el cribado" />;
  }
  return (
    <Section
      title="Cribado previo al ejercicio"
      description="Cada respuesta queda en el historial. Manda la más reciente."
    >
      <ScreeningSection
        patientId={patientId}
        screenings={screenings.data.screenings}
        careTeam={patient.data.careTeam}
        members={members.data.members}
        archived={patient.data.status === 'ARCHIVED'}
      />
    </Section>
  );
}
