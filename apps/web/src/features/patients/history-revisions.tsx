'use client';

import type { ClinicalHistoryResponse, MemberResponse } from '@nutricoach/contracts';
import Link from 'next/link';
import { usePanelSession } from '@/features/session/panel-session';
import { formatInstant } from '@/lib/dates';
import { HISTORY_FORM_LABELS } from './labels';

type Revision = ClinicalHistoryResponse['revisions'][number];

const authorName = (members: readonly MemberResponse[], userId: string): string =>
  members.find((m) => m.userId === userId)?.displayName ?? 'Miembro de la organización';

/** Cada revisión se abre para leerla: así se sigue consultando la historia v1, que ya no se edita. */
export function HistoryRevisionList({
  patientId,
  revisions,
  members,
}: {
  patientId: string;
  revisions: readonly Revision[];
  members: readonly MemberResponse[];
}) {
  const { timezone } = usePanelSession();
  return (
    <section aria-labelledby="revisiones" className="flex flex-col gap-2">
      <h3 id="revisiones" className="font-semibold">
        Revisiones
      </h3>
      {revisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay revisiones.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {revisions.map((revision) => (
            <li key={revision.revision}>
              <Link
                href={`/panel/pacientes/${patientId}/historia/revisiones/${String(revision.revision)}`}
                className="text-brand-text underline"
              >
                Revisión {revision.revision}
              </Link>{' '}
              · {HISTORY_FORM_LABELS[revision.formCode]} ·{' '}
              {formatInstant(revision.recordedAt, timezone)} ·{' '}
              {authorName(members, revision.recordedBy)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quién guardó una revisión y cuándo. */
export function HistoryRevisionMeta({
  revision,
  members,
}: {
  revision: Pick<Revision, 'formCode' | 'recordedAt' | 'recordedBy'>;
  members: readonly MemberResponse[];
}) {
  const { timezone } = usePanelSession();
  return (
    <>
      {HISTORY_FORM_LABELS[revision.formCode]} · Guardada el{' '}
      {formatInstant(revision.recordedAt, timezone)} por {authorName(members, revision.recordedBy)}
    </>
  );
}
