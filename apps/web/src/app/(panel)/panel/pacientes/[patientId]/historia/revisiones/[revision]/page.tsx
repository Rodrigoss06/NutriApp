import type { ClinicalHistoryRevision } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { HistoryRevisionMeta } from '@/features/patients/history-revisions';
import { HistoryRevisionView } from '@/features/patients/history-revision-view';
import { PerformanceProfileCard } from '@/features/patients/performance-profile-card';
import { Section } from '@/features/patients/section';
import { getMembers } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Revisión de la historia clínica' };

/** Una revisión de la historia clínica, de solo lectura (RF-09). Leerla deja un READ en la auditoría (RN-B03). */
export default async function HistoryRevisionPage({
  params,
}: {
  params: Promise<{ patientId: string; revision: string }>;
}) {
  const { patientId, revision } = await params;
  const [response, members] = await Promise.all([
    serverApi<ClinicalHistoryRevision>(
      `/patients/${encodeURIComponent(patientId)}/clinical-history/revisions/${encodeURIComponent(revision)}`,
    ),
    getMembers(),
  ]);
  // Un número que no es de una revisión responde 400 o 404: para quien lo abre, es lo mismo.
  const missing = !response.ok && (response.status === 404 || response.status === 400);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/panel/pacientes/${patientId}/historia`}
        className="text-sm text-brand-text underline"
      >
        Volver a la historia clínica
      </Link>
      {response.ok && members.ok ? (
        <Section
          title={`Revisión ${String(response.data.revision)}`}
          description={
            <HistoryRevisionMeta revision={response.data} members={members.data.members} />
          }
        >
          {response.data.profile ? (
            <PerformanceProfileCard profile={response.data.profile} />
          ) : null}
          <HistoryRevisionView revision={response.data} />
        </Section>
      ) : (
        <Notice
          tone={missing ? 'warning' : 'danger'}
          title={missing ? 'No encontramos esa revisión' : 'No pudimos cargar la revisión'}
        />
      )}
    </div>
  );
}
