import type { PatientResponse } from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { pluralLabel } from '@/features/organization/labels';
import { maskedDocument, PATIENT_STATUS_LABELS, POPULATION_LABELS } from './labels';

/** Cabecera del expediente: quién es, sin datos de salud. El documento, solo con sus 4 últimos dígitos (RN-B06). */
export function PatientHeader({
  patient,
  patientLabel,
}: {
  patient: PatientResponse;
  patientLabel: string;
}) {
  const document = maskedDocument(patient);
  return (
    <header className="flex flex-col gap-2">
      <Link href="/panel/pacientes" className="text-sm text-brand-text underline">
        Volver a {pluralLabel(patientLabel).toLowerCase()}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {patient.firstName} {patient.lastName}
        </h1>
        <StatusBadge tone={patient.status === 'ACTIVE' ? 'success' : 'info'}>
          {PATIENT_STATUS_LABELS[patient.status]}
        </StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="tabular-nums">{patient.code}</span> · {patient.ageYears}{' '}
        {patient.ageYears === 1 ? 'año' : 'años'} · {POPULATION_LABELS[patient.population]} ·{' '}
        {document ?? 'Sin documento'}
      </p>
    </header>
  );
}
