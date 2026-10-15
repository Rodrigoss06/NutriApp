import type { EnergyPrescription } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PrescriptionView } from '@/features/energy/prescription-view';
import { Section } from '@/features/patients/section';
import { getMembers, getOrganization, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { formatInstant } from '@/lib/dates';

export const metadata: Metadata = { title: 'Prescripción energética' };

/** Una prescripción guardada (RF-17, RN-D01): cada componente con su método, sus insumos y su hash. */
export default async function PrescriptionPage({
  params,
}: {
  params: Promise<{ patientId: string; prescriptionId: string }>;
}) {
  const { patientId, prescriptionId } = await params;
  const [patient, prescription, members, organization] = await Promise.all([
    getPatient(patientId),
    serverApi<EnergyPrescription>(`/energy-prescriptions/${encodeURIComponent(prescriptionId)}`),
    getMembers(),
    getOrganization(),
  ]);
  if (!patient.ok) return null;
  const back = `/panel/pacientes/${patientId}/energia`;
  if (!prescription.ok || prescription.data.patientId !== patientId) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="warning" title="No encontramos esta prescripción" />
        <Link href={back} className="text-sm text-brand-text underline">
          Volver a energía
        </Link>
      </div>
    );
  }
  const author = members.ok
    ? members.data.members.find(
        (m) => m.userId === prescription.data.createdBy || m.id === prescription.data.createdBy,
      )
    : undefined;
  const timezone = organization.ok ? organization.data.timezone : 'America/Lima';
  return (
    <Section
      title="Prescripción energética"
      description={
        <>
          {formatInstant(prescription.data.createdAt, timezone)} ·{' '}
          {author?.displayName ?? 'Miembro de la organización'} ·{' '}
          <Link
            href={`/panel/pacientes/${patientId}/evaluaciones/${prescription.data.evaluationId}`}
            className="underline"
          >
            Ver la evaluación de base
          </Link>
        </>
      }
    >
      <Link href={back} className="text-sm text-brand-text underline">
        Volver a energía
      </Link>
      <PrescriptionView prescription={prescription.data} />
      <p className="text-xs text-muted-foreground">
        Motor {prescription.data.engineVersion} · insumos{' '}
        {prescription.data.inputsHash.slice(0, 12)}…
      </p>
    </Section>
  );
}
