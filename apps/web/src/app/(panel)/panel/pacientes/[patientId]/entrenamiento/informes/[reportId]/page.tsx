import type { MesocycleReport } from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Section } from '@/features/patients/section';
import { getMembers, getPatient, patientLabel } from '@/features/patients/server';
import { ComputeReviews } from '@/features/training/compute-reviews';
import { MesocycleReportEditor } from '@/features/training/mesocycle-report-editor';
import { MesocycleReportSheet, ReportTexts } from '@/features/training/mesocycle-report-sheet';
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES,
} from '@/features/training/mesocycle-report-view';
import { serverApi } from '@/lib/api/server';
import { formatInstant } from '@/lib/dates';

export const metadata: Metadata = { title: 'Informe del mesociclo' };

/**
 * Un informe del mesociclo (P14.5, PR 7b; P-28 y P-29; RN-G19): el borrador con sus números de hoy y los textos del coach, o el
 * enviado como se congeló, con el comentario del paciente (la palabra la elige la organización). Leerlo queda en la auditoría
 * (RN-B03).
 */
export default async function MesocycleReportPage({
  params,
}: {
  params: Promise<{ patientId: string; reportId: string }>;
}) {
  const { patientId, reportId } = await params;
  const [patient, report, members, label] = await Promise.all([
    getPatient(patientId),
    serverApi<MesocycleReport>(`/mesocycle-reports/${encodeURIComponent(reportId)}`),
    getMembers(),
    patientLabel(),
  ]);
  const back = `/panel/pacientes/${patientId}/entrenamiento/informes`;
  if (!patient.ok) return null;
  if (!report.ok || report.data.patientId !== patientId) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warning" title="No encontramos este informe" />
        <Link href={back} className="text-sm text-brand-text underline">
          Volver a los informes
        </Link>
      </div>
    );
  }
  if (!members.ok) return <Notice tone="danger" title="No pudimos cargar el informe" />;
  const { data } = report;
  const name = data.body?.mesocycle.name ?? `Mesociclo ${String(data.mesocyclePosition)}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-brand-text underline">
          Volver a los informes
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Informe de «{name}»</h2>
          <StatusBadge tone={REPORT_STATUS_TONES[data.status]}>
            {REPORT_STATUS_LABELS[data.status]}
          </StatusBadge>
        </div>
        {data.status === 'SENT' && data.sentAt ? (
          <p className="text-sm text-muted-foreground">
            Enviado el {formatInstant(data.sentAt, patient.data.timezone)}. Los números son los de
            ese momento y el informe ya no cambia.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Borrador: los números son los de hoy y cambian si llegan registros nuevos de sus
            semanas, hasta que lo envíes.
          </p>
        )}
      </div>
      {data.status === 'DRAFT' ? (
        <ComputeReviews
          patientId={patientId}
          careTeam={patient.data.careTeam}
          members={members.data.members}
        />
      ) : null}
      <MesocycleReportSheet body={data.body} />
      <Section
        title="Conclusiones del coach"
        description="Logro, limitante, ajuste y prioridad, como la hoja."
      >
        {data.status === 'DRAFT' ? (
          <MesocycleReportEditor
            report={data}
            careTeam={patient.data.careTeam}
            members={members.data.members}
          />
        ) : (
          <ReportTexts report={data} />
        )}
      </Section>
      {data.status === 'SENT' ? (
        <Section
          title={`Comentario del ${label.toLowerCase()}`}
          description="Lo escribe desde su app y puede cambiarlo."
        >
          {data.studentComment ? (
            <blockquote className="whitespace-pre-line rounded-lg border border-border bg-card p-3 text-sm">
              {data.studentComment}
            </blockquote>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no comenta.</p>
          )}
        </Section>
      ) : null}
    </div>
  );
}
