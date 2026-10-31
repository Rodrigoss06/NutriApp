import type { EnergyBasisResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { Flame } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getEvaluations } from '@/features/assessment/server';
import { PrescriptionForm } from '@/features/energy/prescription-form';
import { RecordWriteGate } from '@/features/patients/record-write-gate';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Nueva prescripción' };

/**
 * Nueva prescripción energética (RF-17). La base es la última evaluación cerrada con peso y talla, o la que se elija
 * con ?evaluacion=.
 */
export default async function NewPrescriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ evaluacion?: string }>;
}) {
  const [{ patientId }, { evaluacion }] = await Promise.all([params, searchParams]);
  const chosen =
    evaluacion && /^[0-9a-f-]{36}$/i.test(evaluacion) ? `?evaluationId=${evaluacion}` : '';
  const [patient, basis, evaluations, members] = await Promise.all([
    getPatient(patientId),
    serverApi<EnergyBasisResponse>(
      `/patients/${encodeURIComponent(patientId)}/energy-basis${chosen}`,
    ),
    getEvaluations(patientId),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!members.ok)
    return <Notice tone="danger" title="No pudimos cargar los datos para la energía" />;
  const careTeam = patient.data.careTeam;
  const staff = members.data.members;
  const gated = (content: ReactNode) => (
    <RecordWriteGate
      patientId={patientId}
      careTeam={careTeam}
      members={staff}
      action="prescribir energía"
    >
      {content}
    </RecordWriteGate>
  );
  if (patient.data.status === 'ARCHIVED') {
    return <Notice tone="warning" title="Está archivado: no se registran prescripciones nuevas" />;
  }
  if (!basis.ok) {
    return basis.status === 422 ? (
      gated(
        <EmptyState
          icon={Flame}
          title="Primero, una evaluación cerrada con peso y talla"
          description="La prescripción parte de los datos del cuerpo de una evaluación cerrada."
        />,
      )
    ) : (
      <Notice tone="danger" title="No pudimos cargar los datos para la energía" />
    );
  }
  const closed = evaluations.ok
    ? evaluations.data.evaluations.filter((e) => e.status === 'CLOSED' && e.kind !== 'BIA')
    : [];
  return gated(
    <Section title="Nueva prescripción">
      <PrescriptionForm
        key={basis.data.evaluation.id}
        patientId={patientId}
        basis={basis.data}
        evaluations={closed}
      />
    </Section>,
  );
}
