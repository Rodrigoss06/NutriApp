import type {
  ProgramDetail,
  ProgramListResponse,
  TrainingSafetyResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembers, getPatient } from '@/features/patients/server';
import { ProgramEditor } from '@/features/training/program-editor';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Programa de entrenamiento' };

/** Un programa, en borrador o publicado (RF-26, RN-F12). Leerlo deja un READ en la auditoría (RN-B03). */
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ patientId: string; programId: string }>;
}) {
  const { patientId, programId } = await params;
  const path = `/patients/${encodeURIComponent(patientId)}`;
  const [patient, program, programs, safety, members] = await Promise.all([
    getPatient(patientId),
    serverApi<ProgramDetail>(`/training-programs/${encodeURIComponent(programId)}`),
    serverApi<ProgramListResponse>(`${path}/training-programs`),
    serverApi<TrainingSafetyResponse>(`${path}/training-safety`),
    getMembers(),
  ]);
  const base = `/panel/pacientes/${patientId}/entrenamiento/programas`;
  if (!patient.ok) return null;
  if (!program.ok || program.data.patientId !== patientId) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warning" title="No encontramos este programa" />
        <Link href={base} className="text-sm text-brand-text underline">
          Volver a los programas
        </Link>
      </div>
    );
  }
  if (!programs.ok || !safety.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar el programa" />;
  }
  return (
    <ProgramEditor
      key={program.data.id}
      initial={program.data}
      patientId={patientId}
      safety={safety.data}
      formulaFixed={programs.data.programs.some(({ id }) => id !== programId)}
      careTeam={patient.data.careTeam}
      members={members.data.members}
      archived={patient.data.status === 'ARCHIVED'}
      base={base}
    />
  );
}
