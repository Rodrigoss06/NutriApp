import { TableScroll } from '@/features/shell/table-scroll';
import { formatTotal, formatTotalWithGaps, type TotalWithGaps } from './format';

export interface NutrientTotalRow extends TotalWithGaps {
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  /** Segunda columna opcional, como los nutrientes por 100 g cocidos de una receta. */
  readonly extra?: number | null;
}

/**
 * Totales calculados de un plato o una receta (RN-E16): «al menos» con en cuántos falta, o «sin dato» si falta en todos
 * (RN-I03, ADR-061). `of` es cuántos alimentos suman.
 */
export function NutrientTotalsTable({
  caption,
  rows,
  of,
  valueLabel,
  extraLabel,
}: {
  caption: string;
  rows: readonly NutrientTotalRow[];
  of: number;
  valueLabel: string;
  extraLabel?: string;
}) {
  return (
    <TableScroll label={caption}>
      <table className="w-full border-collapse text-sm">
        <caption className="bg-surface px-3 py-2 text-left font-medium">{caption}</caption>
        <thead className="text-left text-muted-foreground">
          <tr className="border-t border-border">
            <th scope="col" className="px-3 py-2 font-medium">
              Nutriente
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {valueLabel}
            </th>
            {extraLabel ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {extraLabel}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { text, gap } = formatTotalWithGaps(row, of, row.code, row.unit);
            return (
              <tr key={row.code} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {row.name}
                </th>
                <td
                  className={
                    row.value === null
                      ? 'w-36 px-3 py-2 text-right text-muted-foreground'
                      : 'w-36 px-3 py-2 text-right whitespace-nowrap tabular-nums'
                  }
                >
                  <span
                    className={
                      row.value === null && gap === null
                        ? 'whitespace-nowrap italic'
                        : 'whitespace-nowrap tabular-nums'
                    }
                  >
                    {text}
                  </span>
                  {gap ? <span className="block text-xs">{gap}</span> : null}
                </td>
                {extraLabel ? (
                  <td
                    className={
                      row.extra === null || row.extra === undefined
                        ? 'w-36 px-3 py-2 text-right whitespace-nowrap text-muted-foreground italic'
                        : 'w-36 px-3 py-2 text-right whitespace-nowrap tabular-nums'
                    }
                  >
                    {formatTotal(row.extra ?? null, row.code, row.unit)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}
