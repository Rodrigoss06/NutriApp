import type { PatientExportListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { PatientExportSection } from '@/features/patient-export/patient-export-section';
import { AppAccessSection } from '@/features/patients/app-access-section';
import { CareTeamSection } from '@/features/patients/care-team-section';
import { PatientDetails } from '@/features/patients/patient-details';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Ficha' };

/** La ficha: datos, equipo de atención, acceso a la app y la exportación de sus datos (RF-08, RF-07, RN-A05, RN-A06, RN-B04). */
export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, members, exports] = await Promise.all([
    getPatient(patientId),
    getMembers(),
    serverApi<PatientExportListResponse>(`/patients/${patientId}/exports`),
  ]);
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
      {/* El soporte no exporta: su lista responde 403 y la sección no se muestra (RN-A09). */}
      {exports.ok ? (
        <PatientExportSection
          patientId={patient.data.id}
          responsibleMemberId={patient.data.responsibleMemberId}
          members={members.data.members}
          initial={exports.data}
        />
      ) : null}
    </div>
  );
}
