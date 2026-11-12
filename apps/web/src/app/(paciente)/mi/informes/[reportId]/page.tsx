import type { MesocycleReport } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportComment } from '@/features/patient-app/report-comment';
import { Section } from '@/features/patients/section';
import { MesocycleReportSheet, ReportTexts } from '@/features/training/mesocycle-report-sheet';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Informe del mesociclo' };

/**
 * Tu informe del mesociclo (P-28 y P-29; RN-G19): lo que escribió tu coach, tus números de esas semanas tal como quedaron al
 * enviarlo (RN-D08), con su método (RN-D02), y tu comentario.
 */
export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const report = await serverApi<MesocycleReport>(
    `/me/mesocycle-reports/${encodeURIComponent(reportId)}`,
  );
  if (!report.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warning" title="No encontramos este informe" />
        <Link
          href="/mi/informes"
          className="flex min-h-touch items-center text-brand-text underline"
        >
          Volver a tus informes
        </Link>
      </div>
    );
  }
  const { data } = report;
  const name = data.body?.mesocycle.name ?? `Mesociclo ${String(data.mesocyclePosition)}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/mi/informes"
          className="flex min-h-touch items-center text-sm text-brand-text underline"
        >
          Volver a tus informes
        </Link>
        <h1 className="text-2xl font-semibold">Informe de «{name}»</h1>
      </div>
      <Section title="Lo que dice tu coach">
        <ReportTexts report={data} />
      </Section>
      <Section title="Comenta tu informe">
        <ReportComment reportId={data.id} comment={data.studentComment} />
      </Section>
      <MesocycleReportSheet body={data.body} />
    </div>
  );
}
