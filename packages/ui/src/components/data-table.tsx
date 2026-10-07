'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** Alineada a la derecha y con cifras de ancho fijo. */
  readonly numeric?: boolean;
}

export interface DataTableProps<T> {
  readonly caption: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** Lo que devuelve la API para la página siguiente (06 §5); null si no hay más. */
  readonly nextCursor: string | null;
  /** Pide la página de `cursor`; null es la primera. */
  readonly onCursorChange: (cursor: string | null) => void;
  readonly empty?: ReactNode;
}

/**
 * Tabla con paginación por cursor (06 §5). La API solo da `nextCursor`: «Anterior» sale de una pila de
 * cursores visitados que guarda el cliente.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  nextCursor,
  onCursorChange,
  empty,
}: DataTableProps<T>) {
  const [visited, setVisited] = useState<(string | null)[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  const goNext = () => {
    if (nextCursor === null) return;
    setVisited((stack) => [...stack, current]);
    setCurrent(nextCursor);
    onCursorChange(nextCursor);
  };
  const goPrevious = () => {
    const previous = visited.at(-1);
    if (previous === undefined) return;
    setVisited((stack) => stack.slice(0, -1));
    setCurrent(previous);
    onCursorChange(previous);
  };

  if (rows.length === 0 && visited.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-3 py-2 text-left font-medium text-muted-foreground',
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
              <tr key={rowKey(row)} className="border-t border-border">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-3 py-2', column.numeric && 'text-right tabular-nums')}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label={`Páginas de ${caption}`} className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={goPrevious} disabled={visited.length === 0}>
          <ChevronLeft aria-hidden />
          Anterior
        </Button>
        <Button variant="secondary" size="sm" onClick={goNext} disabled={nextCursor === null}>
          Siguiente
          <ChevronRight aria-hidden />
        </Button>
      </nav>
    </div>
  );
}
