import type { OverviewPatientsResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { PatientSummary } from '@/features/patients/patient-summary';
import { getOrganization, getPatient, patientLabel } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Resumen' };

/**
 * La entrada del expediente (ADR-138): el estado del paciente, de su fila del panel (RF-34, ADR-137), con cada alerta y cada dato
 * enlazados a su sección. La lectura queda en la auditoría (RN-B03).
 */
export default async function PatientSummaryPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, organization, label, overview] = await Promise.all([
    getPatient(patientId),
    getOrganization(),
    patientLabel(),
    serverApi<OverviewPatientsResponse>(
      `/analytics/overview/patients?ids=${encodeURIComponent(patientId)}`,
    ),
  ]);
  if (!patient.ok) return null;
  if (!overview.ok) return <Notice tone="danger" title="No pudimos cargar el resumen" />;
  return (
    <PatientSummary
      patient={patient.data}
      row={overview.data.patients.find((row) => row.patientId === patientId) ?? null}
      patientLabel={label}
      timezone={organization.ok ? organization.data.timezone : 'America/Lima'}
    />
  );
}
