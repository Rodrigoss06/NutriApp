import { Notice } from '@nutricoach/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { pluralLabel } from '@/features/organization/labels';
import { PatientHeader } from '@/features/patients/patient-header';
import { RecordNav } from '@/features/patients/record-nav';
import { getOrganization, getPatient, patientLabel } from '@/features/patients/server';

/**
 * Expediente del paciente (RF-09, RF-10). Abrirlo deja un READ en la auditoría (RN-B03). Fuera del equipo de atención
 * la API responde 404 (RN-A05): para quien no lo ve, no existe. Las secciones van en la barra lateral, en seis grupos (ADR-138).
 */
export default async function PatientRecordLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, label, organization] = await Promise.all([
    getPatient(patientId),
    patientLabel(),
    getOrganization(),
  ]);
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
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[13rem_minmax(0,1fr)] xl:items-start xl:gap-8">
        <RecordNav
          patientId={patientId}
          features={organization.ok ? organization.data.features : null}
          patientLabel={label}
        />
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
