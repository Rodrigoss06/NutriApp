import type {
  AthleteProfileResponse,
  ExerciseCatalogResponse,
  FunctionalCatalogResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { AthleteProfileForm } from '@/features/training/athlete-profile-form';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Perfil de entrenamiento' };

/** El perfil de entrenamiento (07 §2). Leerlo deja un READ en la auditoría (RN-B03). */
export default async function AthleteProfilePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, profile, exercises, functional, members] = await Promise.all([
    getPatient(patientId),
    serverApi<AthleteProfileResponse>(`/patients/${encodeURIComponent(patientId)}/athlete-profile`),
    serverApi<ExerciseCatalogResponse>('/exercises/catalog'),
    serverApi<FunctionalCatalogResponse>('/functional-evaluations/catalog'),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!profile.ok || !exercises.ok || !functional.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar el perfil de entrenamiento" />;
  }
  return (
    <Section
      title="Perfil de entrenamiento"
      description="Lo que controla la propuesta y el macrociclo. Cada cambio queda como una revisión nueva."
    >
      <AthleteProfileForm
        patientId={patientId}
        current={profile.data.current}
        equipment={exercises.data.equipment}
        physicalTests={functional.data.physicalTests}
        careTeam={patient.data.careTeam}
        members={members.data.members}
        archived={patient.data.status === 'ARCHIVED'}
      />
    </Section>
  );
}
