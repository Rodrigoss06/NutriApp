import type {
  ExerciseCatalogResponse,
  ProgramListResponse,
  TrainingAnalytics,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { TrainingAnalyticsView } from '@/features/analytics/training-analytics';
import { PLAN_STATUS_LABELS } from '@/features/nutrition-plan/labels';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Analítica de rutina' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Analítica de rutina (RF-33): el macrociclo del programa vigente, o del elegido entre los publicados del paciente, contra lo
 * que registró. La API deja un READ en la auditoría (RN-B03).
 */
export default async function TrainingAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { patientId } = await params;
  const { programa, semana } = await searchParams;
  const programId = typeof programa === 'string' && UUID.test(programa) ? programa : null;
  const path = `/patients/${encodeURIComponent(patientId)}`;
  const [analytics, catalog, programs] = await Promise.all([
    serverApi<TrainingAnalytics>(
      `${path}/analytics/training${programId ? `?programId=${programId}` : ''}`,
    ),
    serverApi<ExerciseCatalogResponse>('/exercises/catalog'),
    serverApi<ProgramListResponse>(`${path}/training-programs`),
  ]);
  if (!analytics.ok && analytics.status === 404 && programId) {
    return (
      <Notice tone="warning" title="No encontramos ese programa">
        Puede que no sea de este paciente. Elige otro desde la analítica de rutina.
      </Notice>
    );
  }
  if (!analytics.ok || !catalog.ok || !programs.ok) {
    return <Notice tone="danger" title="No pudimos cargar la analítica de rutina" />;
  }
  const options = programs.data.programs
    .filter((program) => program.status === 'PUBLISHED' || program.status === 'SUPERSEDED')
    .map((program) => ({
      id: program.id,
      label: `${program.name} · versión ${String(program.versionNo)} (${PLAN_STATUS_LABELS[program.status].toLowerCase()})`,
    }));
  return (
    <TrainingAnalyticsView
      analytics={analytics.data}
      patientId={patientId}
      muscleNames={new Map(catalog.data.muscles.map((muscle) => [muscle.code, muscle.name]))}
      programs={options}
      requestedWeek={semana}
    />
  );
}
