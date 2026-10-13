import { Notice } from '@nutricoach/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { pluralLabel } from '@/features/organization/labels';
import { PatientHeader } from '@/features/patients/patient-header';
import { RecordTabs } from '@/features/patients/record-tabs';
import { getPatient, patientLabel } from '@/features/patients/server';

/**
 * Expediente del paciente (RF-09, RF-10). Abrirlo deja un READ en la auditoría (RN-B03). Fuera del equipo de atención
 * la API responde 404 (RN-A05): para quien no lo ve, no existe.
 */
export default async function PatientRecordLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, label] = await Promise.all([getPatient(patientId), patientLabel()]);
  if (!patient.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Notice
          tone={patient.status === 404 || patient.status === 400 ? 'warning' : 'danger'}
          title={
            patient.status === 404 || patient.status === 400
              ? `No encontramos a este ${label.toLowerCase()}`
              : 'No pudimos cargar el expediente'
          }
        >
          Puede que no exista o que no formes parte de su equipo de atención.
        </Notice>
        <Link href="/panel/pacientes" className="text-sm text-brand-text underline">
          Volver a {pluralLabel(label).toLowerCase()}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PatientHeader patient={patient.data} patientLabel={label} />
      <RecordTabs patientId={patientId} />
      {children}
    </div>
  );
}
