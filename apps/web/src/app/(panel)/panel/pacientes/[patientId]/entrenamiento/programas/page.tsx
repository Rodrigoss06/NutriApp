import type { ProgramListResponse, TrainingSafetyResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { Dumbbell } from 'lucide-react';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { NewProgram } from '@/features/training/new-program';
import { ProgramList } from '@/features/training/program-list';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Programas de entrenamiento' };

/** Los programas del paciente con sus versiones (RF-26). Leerlos deja un READ en la auditoría (RN-B03). */
export default async function ProgramsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const path = `/patients/${encodeURIComponent(patientId)}`;
  const [patient, programs, safety, members] = await Promise.all([
    getPatient(patientId),
    serverApi<ProgramListResponse>(`${path}/training-programs`),
    serverApi<TrainingSafetyResponse>(`${path}/training-safety`),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!programs.ok || !safety.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar los programas" />;
  }
  const base = `/panel/pacientes/${patientId}/entrenamiento/programas`;
  const list = programs.data.programs;
  return (
    <Section
      title="Programas"
      description="Un programa se arma a mano o sale como propuesta del perfil de entrenamiento. Publicado, no se edita: para cambiarlo, se crea una versión nueva."
    >
      <NewProgram
        patientId={patientId}
        safety={safety.data}
        fixedFormula={list[0]?.oneRmFormula ?? null}
        careTeam={patient.data.careTeam}
        members={members.data.members}
        archived={patient.data.status === 'ARCHIVED'}
        base={base}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Todavía no hay programas"
          description="Genera una propuesta desde el perfil o arma uno a mano."
        />
      ) : (
        <ProgramList programs={list} base={base} />
      )}
    </Section>
  );
}
