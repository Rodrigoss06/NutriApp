import type { MesocycleReportsResponse } from '@nutricoach/contracts';
import { EmptyState, Notice, StatusBadge } from '@nutricoach/ui';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembers, getPatient } from '@/features/patients/server';
import { CreateMesocycleReport } from '@/features/training/create-mesocycle-report';
import {
  MESOCYCLE_MOMENT_LABELS,
  mesocycleMoment,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES,
} from '@/features/training/mesocycle-report-view';
import { serverApi } from '@/lib/api/server';
import { formatDate, todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Informes del mesociclo' };

const MOMENT_TONES = { CLOSED: 'success', CURRENT: 'info', UPCOMING: 'info' } as const;

/**
 * Los informes de cada mesociclo del programa vigente (P14.5, PR 7b; P-28; RN-G19): uno por mesociclo, en borrador mientras el coach
 * escribe y enviado cuando cierra su última semana. Leerlos queda en la auditoría (RN-B03).
 */
export default async function MesocycleReportsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, list, members] = await Promise.all([
    getPatient(patientId),
    serverApi<MesocycleReportsResponse>(
      `/patients/${encodeURIComponent(patientId)}/mesocycle-reports`,
    ),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!list.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar los informes" />;
  }
  const { program, mesocycles } = list.data;
  if (!program) {
    return (
      <EmptyState
        icon={FileText}
        title="Sin programa publicado"
        description="Cada mesociclo del programa publicado tiene su informe: el volumen cumplido, los récords, el control de cada semana y tus conclusiones."
        action={
          <Link
            href={`/panel/pacientes/${patientId}/entrenamiento/programas`}
            className="text-sm text-brand-text underline"
          >
            Ir a los programas
          </Link>
        }
      />
    );
  }
  const today = todayIn(patient.data.timezone);
  const base = `/panel/pacientes/${patientId}/entrenamiento/informes`;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{program.name}</span>. Un informe por
        mesociclo: lo escribes en borrador y lo envías cuando cierra su última semana. Enviado, ya
        no cambia.
      </p>
      <ul aria-label="Mesociclos del programa" className="flex flex-col gap-2">
        {mesocycles.map((mesocycle) => {
          const moment = mesocycleMoment(mesocycle, today);
          return (
            <li
              key={mesocycle.position}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{mesocycle.name}</span>
                <span className="text-sm text-muted-foreground">
                  Del {formatDate(mesocycle.startDate)} al {formatDate(mesocycle.endDate)}
                </span>
                <span className="flex flex-wrap gap-2">
                  <StatusBadge tone={MOMENT_TONES[moment]}>
                    {MESOCYCLE_MOMENT_LABELS[moment]}
                  </StatusBadge>
                  {mesocycle.report ? (
                    <StatusBadge tone={REPORT_STATUS_TONES[mesocycle.report.status]}>
                      {REPORT_STATUS_LABELS[mesocycle.report.status]}
                    </StatusBadge>
                  ) : null}
                  {mesocycle.report?.hasComment ? (
                    <StatusBadge tone="info">Con comentario</StatusBadge>
                  ) : null}
                </span>
              </div>
              {mesocycle.report ? (
                <Link
                  href={`${base}/${mesocycle.report.id}`}
                  className="flex min-h-touch items-center text-sm text-brand-text underline"
                >
                  Abrir el informe de «{mesocycle.name}»
                </Link>
              ) : (
                <CreateMesocycleReport
                  patientId={patientId}
                  programId={program.programId}
                  mesocyclePosition={mesocycle.position}
                  mesocycleName={mesocycle.name}
                  careTeam={patient.data.careTeam}
                  members={members.data.members}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
