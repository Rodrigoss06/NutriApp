import type { PatientMesocycleReportsResponse } from '@nutricoach/contracts';
import { EmptyState, Notice, StatusBadge } from '@nutricoach/ui';
import { ChevronRight, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api/server';
import { formatDate } from '@/lib/dates';

export const metadata: Metadata = { title: 'Informes' };

/** Los informes de cada mesociclo que te envió tu coach (P-28; RN-G19), el más reciente primero. */
export default async function Page() {
  const reports = await serverApi<PatientMesocycleReportsResponse>('/me/mesocycle-reports');
  if (!reports.ok) return <Notice tone="danger" title="No pudimos cargar tus informes" />;
  const list = reports.data.reports;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Informes</h1>
      {list.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Todavía no tienes informes"
          description="Al cerrar cada mesociclo, tu coach te envía un informe con lo que lograste y lo que sigue."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Tus informes">
          {list.map((report) => (
            <li key={report.id}>
              <Link
                href={`/mi/informes/${report.id}`}
                className="flex min-h-touch items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-medium">
                    {report.mesocycleName} · {report.programName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Del {formatDate(report.startDate)} al {formatDate(report.endDate)}
                  </span>
                  {report.hasComment ? null : (
                    <StatusBadge tone="info">Falta tu comentario</StatusBadge>
                  )}
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
