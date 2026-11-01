import { PROGRAM_ORIGIN_LABELS, type ProgramSummary } from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { PLAN_STATUS_LABELS, PLAN_STATUS_TONES } from '@/features/nutrition-plan/labels';
import { TableScroll } from '@/features/shell/table-scroll';
import { formatDate } from '@/lib/dates';

/** Los programas del paciente con sus versiones, del más reciente al más antiguo (RF-26). */
export function ProgramList({
  programs,
  base,
}: {
  programs: readonly ProgramSummary[];
  base: string;
}) {
  return (
    <TableScroll label="Programas de entrenamiento">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Programas de entrenamiento</caption>
        <thead className="bg-surface text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Programa
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Versión
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Origen
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Estado
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Inicio
            </th>
          </tr>
        </thead>
        <tbody>
          {programs.map((program) => (
            <tr key={program.id} className="border-t border-border">
              <td className="px-3 py-2">
                <Link href={`${base}/${program.id}`} className="text-brand-text underline">
                  {program.name}
                </Link>
              </td>
              <td className="px-3 py-2 tabular-nums">{program.versionNo}</td>
              <td className="px-3 py-2">{PROGRAM_ORIGIN_LABELS[program.origin]}</td>
              <td className="px-3 py-2">
                <StatusBadge tone={PLAN_STATUS_TONES[program.status]}>
                  {PLAN_STATUS_LABELS[program.status]}
                </StatusBadge>
              </td>
              <td className="px-3 py-2">
                {program.startDate ? formatDate(program.startDate) : 'Al publicar'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
