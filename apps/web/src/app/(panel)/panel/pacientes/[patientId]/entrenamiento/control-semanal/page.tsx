import type { TrainingAnalytics, WeeklyReviewsResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMembers, getPatient } from '@/features/patients/server';
import { ComputeReviews } from '@/features/training/compute-reviews';
import { WeeklyReviewBoard } from '@/features/training/weekly-review-board';
import { macrocycleRows, selectedWeekNo } from '@/features/training/weekly-review-view';
import { serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Control semanal' };

/**
 * Control semanal del macrociclo (RF-42, RN-G16, RN-F17, 07 §10): el resumen de las semanas del programa vigente y la
 * decisión del coach sobre cada semana cerrada. El paciente no lo ve (05.2). Leerlo queda en la auditoría (RN-B03).
 */
export default async function WeeklyReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { patientId } = await params;
  const { semana } = await searchParams;
  const path = `/patients/${encodeURIComponent(patientId)}`;
  const [patient, reviews, analytics, members] = await Promise.all([
    getPatient(patientId),
    serverApi<WeeklyReviewsResponse>(`${path}/weekly-reviews`),
    serverApi<TrainingAnalytics>(`${path}/analytics/training`),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!reviews.ok || !analytics.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar el control semanal" />;
  }
  if (!reviews.data.program || !analytics.data.program) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Sin programa publicado"
        description="El control semanal compara cada semana del programa publicado con los registros diarios del paciente."
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
  const rows = macrocycleRows(
    analytics.data.weeks,
    reviews.data.reviews,
    todayIn(patient.data.timezone),
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{reviews.data.program.name}</span> ·{' '}
        {reviews.data.program.totalWeeks} semanas. El método propone; decides tú, y la semana cambia
        para el paciente cuando publicas la versión nueva del programa.
      </p>
      <ComputeReviews
        patientId={patientId}
        careTeam={patient.data.careTeam}
        members={members.data.members}
      />
      <WeeklyReviewBoard
        rows={rows}
        weeks={analytics.data.weeks}
        selected={selectedWeekNo(rows, semana)}
        patientId={patientId}
        careTeam={patient.data.careTeam}
        members={members.data.members}
        timezone={patient.data.timezone}
      />
    </div>
  );
}
