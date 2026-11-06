import type { DietTrend, EvolutionResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EvolutionBoard } from '@/features/assessment/evolution-board';
import { trendRange } from '@/features/assessment/evolution-view';
import { DownloadSheetButton } from '@/features/documents/download-sheet-button';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { formatDate, todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Evolución' };

/**
 * La evolución antropométrica del paciente (RF-35): sus evaluaciones cerradas vigentes en el tiempo, con el cambio real frente
 * al ruido (RN-C06), cada método por separado (RN-D03), la tendencia por mes (RN-G09) y la ficha de evolución (RN-H01). La
 * API deja un READ en la auditoría (RN-B03).
 */
export default async function EvolutionPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const path = `/patients/${encodeURIComponent(patientId)}`;
  const [patient, evolution, members] = await Promise.all([
    getPatient(patientId),
    serverApi<EvolutionResponse>(`${path}/evolution`),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!evolution.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar la evolución" />;
  }
  const { evaluations } = evolution.data;
  const back = (
    <Link
      href={`/panel/pacientes/${patientId}/evaluaciones`}
      className="text-sm text-brand-text underline"
    >
      Volver a las evaluaciones
    </Link>
  );
  const first = evaluations[0];
  const last = evaluations.at(-1);
  if (!first || !last) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState
          icon={TrendingUp}
          title="Todavía no hay evaluaciones cerradas"
          description="La evolución se arma con las evaluaciones cerradas del paciente, en orden."
        />
      </div>
    );
  }
  const range = trendRange(evaluations, todayIn(patient.data.timezone));
  const trend = await serverApi<DietTrend>(
    `${path}/analytics/trend?from=${range.from}&to=${range.to}`,
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {back}
        <h2 className="text-xl font-semibold">Evolución</h2>
        <p className="text-sm text-muted-foreground">
          {evaluations.length === 1
            ? `1 evaluación, el ${formatDate(last.localDate)}.`
            : `${String(evaluations.length)} evaluaciones, del ${formatDate(first.localDate)} al ${formatDate(last.localDate)}.`}
        </p>
      </div>
      {evaluations.length === 1 ? (
        <Notice tone="info" title="Con una sola evaluación todavía no hay evolución">
          Con la próxima evaluación cerrada vas a ver cada cambio frente al CMD95.
        </Notice>
      ) : null}
      <EvolutionBoard
        evolution={evolution.data}
        trend={trend.ok ? trend.data : null}
        members={members.data.members}
        patientId={patientId}
        download={
          <DownloadSheetButton
            patientId={patientId}
            source={{ sourceType: 'EVALUATION', sourceId: last.evaluationId, kind: 'EVOLUTION' }}
            label="Descargar ficha de evolución (PDF)"
          />
        }
      />
    </div>
  );
}
