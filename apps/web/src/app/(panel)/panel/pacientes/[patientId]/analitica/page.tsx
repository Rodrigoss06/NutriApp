import type { DietAnalytics } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { DietAnalyticsView } from '@/features/analytics/diet-analytics';
import { dietRange, rangeWeeksOf } from '@/features/analytics/range';
import { getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Analítica de dieta' };

/**
 * Analítica de dieta (RF-32): las semanas completas del rango hasta hoy, en la fecha local del paciente (RN-G04). La API la
 * arma desde la proyección diaria, con los ajustes aplicados (RN-G02), y deja un READ en la auditoría (RN-B03).
 */
export default async function DietAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { patientId } = await params;
  const { semanas } = await searchParams;
  const patient = await getPatient(patientId);
  if (!patient.ok) return null;
  const weeks = rangeWeeksOf(semanas);
  const { from, to } = dietRange(weeks, todayIn(patient.data.timezone));
  const analytics = await serverApi<DietAnalytics>(
    `/patients/${encodeURIComponent(patientId)}/analytics/diet?from=${from}&to=${to}`,
  );
  if (!analytics.ok)
    return <Notice tone="danger" title="No pudimos cargar la analítica de dieta" />;
  return <DietAnalyticsView analytics={analytics.data} patientId={patientId} weeks={weeks} />;
}
