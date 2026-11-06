import { cn } from '@nutricoach/ui';
import type { ReactNode } from 'react';
import { TableScroll } from '@/features/shell/table-scroll';

export interface StatColumn<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  /** Alineada a la derecha y con cifras de ancho fijo. */
  readonly numeric?: boolean;
}

/**
 * Una tabla de cifras de la analítica: la primera columna nombra la fila (th scope="row") y las numéricas van a la
 * derecha con tabular-nums. Los encabezados se parten en dos líneas si hace falta; las cifras, no. En el celular se desplaza
 * dentro de una región con nombre que se puede enfocar.
 */
export function StatTable<T>({
  label,
  caption,
  columns,
  rows,
  rowKey,
  rowClassName,
}: {
  label: string;
  caption: string;
  columns: readonly StatColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
}) {
  return (
    <TableScroll label={label} className="bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-3 py-2 text-left align-bottom font-medium',
                  column.numeric && 'text-right',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={cn('border-t border-border', rowClassName?.(row))}>
              {columns.map((column, index) =>
                index === 0 ? (
                  <th
                    key={column.key}
                    scope="row"
                    className="px-3 py-2 text-left font-medium whitespace-nowrap"
                  >
                    {column.cell(row)}
                  </th>
                ) : (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-2 whitespace-nowrap',
                      column.numeric && 'text-right tabular-nums',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
