import type { ReactNode } from 'react';
import { AnalyticsTabs } from '@/features/analytics/analytics-tabs';

/**
 * La analítica del paciente (RF-32, RF-33): lo que registró, convertido en métricas que se leen de un vistazo, desde las
 * proyecciones de la API (05.3). Cada número con su método (RN-D02). Abrirla deja un READ en la auditoría (RN-B03).
 */
export default async function AnalyticsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsTabs patientId={patientId} />
      {children}
    </div>
  );
}
