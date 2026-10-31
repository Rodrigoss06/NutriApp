import type { EnergyPrescriptionListResponse, ExchangeListResponse } from '@nutricoach/contracts';
import { Button, EmptyState, Notice } from '@nutricoach/ui';
import { Salad } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DietaryAlertsNotice } from '@/features/nutrition-plan/dietary-alerts-notice';
import { NewPlanForm } from '@/features/nutrition-plan/new-plan-form';
import { RecordWriteGate } from '@/features/patients/record-write-gate';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Nuevo plan' };

/** Un plan nuevo de cualquier modalidad, desde una prescripción energética (RF-19 a RF-21). */
export default async function NewPlanPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, prescriptions, lists, members] = await Promise.all([
    getPatient(patientId),
    serverApi<EnergyPrescriptionListResponse>(
      `/patients/${encodeURIComponent(patientId)}/energy-prescriptions`,
    ),
    serverApi<ExchangeListResponse>('/exchange-lists'),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (patient.data.status === 'ARCHIVED') {
    return <Notice tone="warning" title="Está archivado: no se crean planes nuevos" />;
  }
  if (!prescriptions.ok || !lists.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar lo necesario para el plan" />;
  }
  const careTeam = patient.data.careTeam;
  const staff = members.data.members;
  const gated = (content: ReactNode) => (
    <RecordWriteGate
      patientId={patientId}
      careTeam={careTeam}
      members={staff}
      action="crear un plan"
    >
      {content}
    </RecordWriteGate>
  );
  if (prescriptions.data.prescriptions.length === 0) {
    return gated(
      <EmptyState
        icon={Salad}
        title="Primero, una prescripción energética"
        description="El plan toma sus metas de kcal y macronutrientes de una prescripción."
        action={
          <Button asChild variant="secondary">
            <Link href={`/panel/pacientes/${patientId}/energia/nueva`}>Nueva prescripción</Link>
          </Button>
        }
      />,
    );
  }
  return gated(
    <Section
      title="Nuevo plan"
      description="Elige la modalidad y la prescripción de la que salen las metas. Después armas el plan en el editor."
    >
      <DietaryAlertsNotice patientId={patientId} />
      <NewPlanForm
        patientId={patientId}
        prescriptions={prescriptions.data.prescriptions}
        lists={lists.data.lists}
      />
    </Section>,
  );
}
