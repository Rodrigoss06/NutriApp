import {
  REVIEW_KIND_LABELS,
  TRAINING_INTENSITY_LABELS,
  type ProgramDetail,
} from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import { TableScroll } from '@/features/shell/table-scroll';
import { formatDate } from '@/lib/dates';
import { formatTestValue } from './labels';
import { phaseSummary, weeksOfDocument } from './program-draft';

const COLUMNS = ['Semana', 'Fase', 'Objetivo', 'Volumen', 'Intensidad', 'RIR', 'Revisión'];

/**
 * El macrociclo (RN-F13, 07 §7): cada semana con su fase, su factor de volumen, su intensidad orientativa, su RIR objetivo y su revisión, de
 * la versión de la tabla que usó el programa. Una versión nueva no lo toca.
 */
export function ProgramMacrocycle({
  program,
  defaultOpen,
}: {
  program: ProgramDetail;
  defaultOpen: boolean;
}) {
  const weeks = weeksOfDocument(program.document);
  if (!weeks.some((week) => phaseSummary(week).length > 0)) return null;
  return (
    <details open={defaultOpen} className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer py-2 font-semibold">
        Macrociclo: {weeks.length} semanas
      </summary>
      <div className="flex flex-col gap-2 pt-2">
        <TableScroll label="Macrociclo">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Las semanas del macrociclo con su fase</caption>
            <thead className="bg-surface text-left text-muted-foreground">
              <tr>
                {COLUMNS.map((title) => (
                  <th key={title} scope="col" className="px-3 py-2 font-medium">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.id} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{week.weekNo}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {week.phaseEs ?? '—'}
                      {week.isDeload && week.phaseEs !== 'Descarga' ? (
                        <StatusBadge tone="info">Descarga</StatusBadge>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">{week.phaseGoalEs ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{formatTestValue(week.volumeFactor)}</td>
                  <td className="px-3 py-2">
                    {week.intensity ? TRAINING_INTENSITY_LABELS[week.intensity] : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatTestValue(week.targetRir)}</td>
                  <td className="px-3 py-2">
                    {week.reviewKind ? REVIEW_KIND_LABELS[week.reviewKind] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {program.periodizationValidFrom ? (
          <p className="text-sm text-muted-foreground">
            Tabla de fases vigente desde {formatDate(program.periodizationValidFrom)}
            {program.templateVersion ? ` · plantilla ${program.templateVersion}` : ''}. Una versión
            nueva de la tabla no cambia este programa.
          </p>
        ) : null}
      </div>
    </details>
  );
}
