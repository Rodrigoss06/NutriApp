import {
  PHYSICAL_TEST_STATUS_LABELS,
  type FunctionalCatalogResponse,
  type PhysicalTestSummaryResponse,
} from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import { TableScroll } from '@/features/shell/table-scroll';
import { formatTestValue, PHYSICAL_TEST_STATUS_TONES } from './labels';

const MOMENTS = [
  ['baseline', 'Inicial'],
  ['week4', 'Semana 4'],
  ['week8', 'Semana 8'],
  ['week12', 'Semana 12'],
  ['retest', 'Retest'],
] as const;

/** Cada prueba física por momento, con su objetivo, su cambio y su estado (07 §4). Cambio = semana 12 − inicial. */
export function PhysicalSummaryTable({
  summary,
  tests,
  targets,
}: {
  summary: PhysicalTestSummaryResponse['tests'];
  tests: FunctionalCatalogResponse['physicalTests'];
  targets: Readonly<Record<string, number>>;
}) {
  const byCode = new Map(tests.map((test) => [test.code, test]));
  return (
    <TableScroll label="Resumen de las pruebas físicas">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Cada prueba física por momento, con su cambio y su estado
        </caption>
        <thead className="bg-surface text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Prueba
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Objetivo
            </th>
            {MOMENTS.map(([key, label]) => (
              <th key={key} scope="col" className="px-3 py-2 text-right font-medium">
                {label}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Cambio
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => {
            const test = byCode.get(row.testCode);
            return (
              <tr key={row.testCode} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {test?.name ?? row.testCode}
                  {test ? <span className="text-muted-foreground"> ({test.unit})</span> : null}
                </th>
                <td className="px-3 py-2 tabular-nums">{formatTestValue(targets[row.testCode])}</td>
                {MOMENTS.map(([key]) => (
                  <td key={key} className="px-3 py-2 text-right tabular-nums">
                    {formatTestValue(row[key])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{formatTestValue(row.change)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge tone={PHYSICAL_TEST_STATUS_TONES[row.status]}>
                    {PHYSICAL_TEST_STATUS_LABELS[row.status]}
                  </StatusBadge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}
