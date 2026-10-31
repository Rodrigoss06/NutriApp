import type { ClinicalHistoryResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AnamnesisForm } from '@/features/patients/anamnesis-form';
import { HistoryRevisionList } from '@/features/patients/history-revisions';
import { PerformanceProfileCard } from '@/features/patients/performance-profile-card';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Historia clínica' };

/**
 * Historia clínica versionada (RF-09) con la anamnesis V2 y su perfil de rendimiento (RF-43, RN-F16). La v1 de texto libre
 * queda de solo lectura. Leerla deja un READ en la auditoría (RN-B03).
 */
export default async function HistoryPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, history, members] = await Promise.all([
    getPatient(patientId),
    serverApi<ClinicalHistoryResponse>(
      `/patients/${encodeURIComponent(patientId)}/clinical-history`,
    ),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!history.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar la historia clínica" />;
  }
  const { current, revisions } = history.data;
  return (
    <Section
      title="Historia clínica"
      description="Anamnesis integral, presencial u online: recoge lo que cambia la seguridad, el entrenamiento o la nutrición. Se guarda aunque falten respuestas, y cada guardado es una revisión nueva."
    >
      {current?.profile ? <PerformanceProfileCard profile={current.profile} /> : null}
      {current?.formCode === 'ANAMNESIS' ? (
        <Notice tone="info" title="La historia anterior queda de solo lectura">
          Era de texto libre: al guardar la anamnesis, queda como una revisión más.{' '}
          <Link
            href={`/panel/pacientes/${patientId}/historia/revisiones/${String(current.revision)}`}
            className="underline"
          >
            Ver la revisión {current.revision}
          </Link>
        </Notice>
      ) : null}
      <AnamnesisForm
        patientId={patientId}
        history={history.data}
        members={members.data.members}
        careTeam={patient.data.careTeam}
        archived={patient.data.status === 'ARCHIVED'}
      />
      <HistoryRevisionList
        patientId={patientId}
        revisions={revisions}
        members={members.data.members}
      />
    </Section>
  );
}
