import {
  PHYSICAL_MOMENT_LABELS,
  type FunctionalEvaluationSummary,
  type MemberResponse,
} from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { STATUS_LABELS, STATUS_TONES } from '@/features/assessment/labels';
import { TableScroll } from '@/features/shell/table-scroll';
import { formatInstant } from '@/lib/dates';

/** Las evaluaciones de un tipo, de la más reciente a la más antigua, con quién evaluó (RF-41). */
export function FunctionalEvaluationList({
  caption,
  evaluations,
  members,
  timezone,
  base,
}: {
  caption: string;
  evaluations: readonly FunctionalEvaluationSummary[];
  members: readonly MemberResponse[];
  timezone: string;
  base: string;
}) {
  const names = new Map(members.map((m) => [m.id, m.displayName]));
  const withMoment = evaluations.some((evaluation) => evaluation.moment !== null);
  return (
    <TableScroll label={caption}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Fecha
            </th>
            {withMoment ? (
              <th scope="col" className="px-3 py-2 font-medium">
                Momento
              </th>
            ) : null}
            <th scope="col" className="px-3 py-2 font-medium">
              Estado
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Evaluó
            </th>
          </tr>
        </thead>
        <tbody>
          {evaluations.map((evaluation) => (
            <tr key={evaluation.id} className="border-t border-border">
              <td className="px-3 py-2">
                <Link href={`${base}/${evaluation.id}`} className="text-brand-text underline">
                  {formatInstant(evaluation.measuredAt, timezone)}
                </Link>
              </td>
              {withMoment ? (
                <td className="px-3 py-2">
                  {evaluation.moment ? PHYSICAL_MOMENT_LABELS[evaluation.moment] : '—'}
                </td>
              ) : null}
              <td className="px-3 py-2">
                <StatusBadge tone={STATUS_TONES[evaluation.status]}>
                  {STATUS_LABELS[evaluation.status]}
                </StatusBadge>
                {evaluation.revision > 1 ? (
                  <span className="ml-2 text-muted-foreground">Revisión {evaluation.revision}</span>
                ) : null}
              </td>
              <td className="px-3 py-2">{names.get(evaluation.evaluatorMemberId) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
