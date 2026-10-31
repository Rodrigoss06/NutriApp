import type {
  ClinicalNoteListResponse,
  ConditionListResponse,
  FoodExclusionListResponse,
  GoalListResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { ConditionsSection } from '@/features/patients/conditions-section';
import { GoalsSection } from '@/features/patients/goals-section';
import { RecordWriteGate } from '@/features/patients/record-write-gate';
import { NotesSection } from '@/features/patients/notes-section';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Condiciones, objetivos y notas' };

/** Condiciones, objetivos y notas (RF-09). Cada lectura deja un READ en la auditoría (RN-B03). */
export default async function RecordsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const id = encodeURIComponent(patientId);
  const [patient, conditions, exclusions, goals, notes, members] = await Promise.all([
    getPatient(patientId),
    serverApi<ConditionListResponse>(`/patients/${id}/conditions`),
    serverApi<FoodExclusionListResponse>(`/patients/${id}/food-exclusions`),
    serverApi<GoalListResponse>(`/patients/${id}/goals`),
    serverApi<ClinicalNoteListResponse>(`/patients/${id}/notes`),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!conditions.ok || !exclusions.ok || !goals.ok || !notes.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar el expediente" />;
  }
  const archived = patient.data.status === 'ARCHIVED';
  return (
    <div className="flex flex-col gap-8">
      <RecordWriteGate
        patientId={patientId}
        careTeam={patient.data.careTeam}
        members={members.data.members}
        action="escribir en este expediente"
      />
      <Section title="Condiciones">
        <ConditionsSection
          patientId={patientId}
          conditions={conditions.data.conditions}
          exclusions={exclusions.data.conditions}
          careTeam={patient.data.careTeam}
          members={members.data.members}
          archived={archived}
        />
      </Section>
      <Section title="Objetivos">
        <GoalsSection
          patientId={patientId}
          goals={goals.data.goals}
          careTeam={patient.data.careTeam}
          members={members.data.members}
          archived={archived}
        />
      </Section>
      <Section title="Notas">
        <NotesSection
          patientId={patientId}
          notes={notes.data.notes}
          careTeam={patient.data.careTeam}
          members={members.data.members}
          archived={archived}
        />
      </Section>
    </div>
  );
}
