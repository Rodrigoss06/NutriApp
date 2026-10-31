import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { AppAccessSection } from '@/features/patients/app-access-section';
import { CareTeamSection } from '@/features/patients/care-team-section';
import { PatientDetails } from '@/features/patients/patient-details';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';

export const metadata: Metadata = { title: 'Ficha' };

/** La ficha: datos, equipo de atención y acceso a la app (RF-08, RN-A05, RN-A06). */
export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, members] = await Promise.all([getPatient(patientId), getMembers()]);
  if (!patient.ok) return null;
  if (!members.ok) return <Notice tone="danger" title="No pudimos cargar el equipo" />;
  return (
    <div className="flex flex-col gap-8">
      <Section title="Datos">
        <PatientDetails patient={patient.data} members={members.data.members} />
      </Section>
      <Section
        title="Equipo de atención"
        description="Con la visibilidad por equipo, solo ellos y el dueño de la organización ven este expediente."
      >
        <CareTeamSection patient={patient.data} members={members.data.members} />
      </Section>
      <Section title="Acceso a la app">
        <AppAccessSection patient={patient.data} members={members.data.members} />
      </Section>
    </div>
  );
}
