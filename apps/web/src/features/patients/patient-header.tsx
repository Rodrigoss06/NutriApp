import type { PatientResponse } from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import { ChevronLeft } from 'lucide-react';
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
      <Link
        href="/panel/pacientes"
        className="inline-flex w-fit items-center gap-1 text-sm text-brand-text underline underline-offset-4"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Volver a {pluralLabel(patientLabel).toLowerCase()}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold">
          {patient.firstName} {patient.lastName}
        </h1>
        <StatusBadge tone={patient.status === 'ACTIVE' ? 'success' : 'info'}>
          {PATIENT_STATUS_LABELS[patient.status]}
        </StatusBadge>
      </div>
      <ul className="flex flex-wrap gap-2 font-label text-sm text-muted-foreground [&>li]:rounded-md [&>li]:border [&>li]:border-border [&>li]:bg-card [&>li]:px-2 [&>li]:py-0.5">
        <li className="tabular-nums">{patient.code}</li>
        <li>
          {patient.ageYears} {patient.ageYears === 1 ? 'año' : 'años'}
        </li>
        <li>{POPULATION_LABELS[patient.population]}</li>
        <li>{document ?? 'Sin documento'}</li>
      </ul>
    </header>
  );
}
