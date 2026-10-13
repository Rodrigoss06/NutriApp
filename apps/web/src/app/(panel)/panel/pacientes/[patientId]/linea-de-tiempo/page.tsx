import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getPatient } from '@/features/patients/server';
import { TimelineList } from '@/features/patients/timeline-list';

export const metadata: Metadata = { title: 'Línea de tiempo' };

/** Línea de tiempo del expediente (RF-10). Cada página leída deja un READ en la auditoría (RN-B03). */
export default async function TimelinePage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const patient = await getPatient(patientId);
  if (!patient.ok) return null;
  return (
    <Section title="Línea de tiempo">
      <TimelineList patientId={patientId} />
    </Section>
  );
}
