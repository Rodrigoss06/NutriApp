import {
  methodLabel,
  type ExchangeGroupCode,
  type ExchangeNutritionPlan,
  type ExchangePlanPreview,
} from '@nutricoach/contracts';
import { formatNumber, MethodBadge, Notice, StatusBadge } from '@nutricoach/ui';
import type { ReactNode } from 'react';
import { TableScroll } from '@/features/shell/table-scroll';

type Calculation = Pick<
  ExchangePlanPreview,
  'targets' | 'totals' | 'adequacy' | 'exchanges' | 'methods'
>;
type ListGroup = ExchangeNutritionPlan['exchangeList']['groups'][number];

const ADEQUACY_ROWS = [
  { key: 'kcal', label: 'Energía', macro: 'kcal', kind: 'kcal', unit: 'kcal' },
  { key: 'cho', label: 'Carbohidratos', macro: 'choG', kind: 'grams', unit: 'g' },
  { key: 'protein', label: 'Proteína', macro: 'proteinG', kind: 'grams', unit: 'g' },
  { key: 'fat', label: 'Grasa', macro: 'fatG', kind: 'grams', unit: 'g' },
] as const;

/**
 * El método de un cálculo del plan con sus avisos (RN-D01, RN-D02). El reparto corre una vez por grupo y la adecuación
 * una por nutriente: los avisos se juntan sin repetirse.
 */
export function PlanMethod({ methods, code }: { methods: Calculation['methods']; code: string }) {
  const runs = methods.filter((m) => m.methodCode === code);
  const warnings = [
    ...new Map(
      runs.flatMap((run) => run.warnings).map((w) => [`${w.code}-${w.message}`, w]),
    ).values(),
  ];
  return (
    <div className="flex flex-col gap-2">
      <MethodBadge label={methodLabel(code)} code={code} version={runs[0]?.methodVersion} />
      {warnings.map((issue) => (
        <Notice
          key={`${issue.code}-${issue.message}`}
          tone={issue.severity === 'INFO' ? 'info' : 'warning'}
          title={issue.message}
          rule={issue.rule}
        />
      ))}
    </div>
  );
}

/**
 * Adecuación del plan contra las metas exactas de la prescripción, con el rango de la organización (RN-E10). En rango,
 * por debajo o por encima: ícono y texto, nunca solo color.
 */
export function AdequacyTable({ calculation }: { calculation: Calculation }) {
  const { targets, totals, adequacy } = calculation;
  const [min, max] = adequacy.rangePct;
  return (
    <div className="flex flex-col gap-2">
      <TableScroll label="Adecuación del plan">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Adecuación del plan</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                <span className="sr-only">Nutriente</span>
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Meta
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Plan
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Adecuación
              </th>
            </tr>
          </thead>
          <tbody>
            {ADEQUACY_ROWS.map((row) => {
              const value = adequacy[row.key];
              const tone = value.inRange ? 'success' : 'warning';
              const state = value.inRange
                ? 'En rango'
                : value.pct < min
                  ? 'Por debajo'
                  : 'Por encima';
              return (
                <tr key={row.key} className="border-t border-border" data-adequacy={row.key}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {row.label}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(targets[row.macro], row.kind)} {row.unit}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(totals[row.macro], row.kind)} {row.unit}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <span className="tabular-nums">{formatNumber(value.pct, 'percent')} %</span>
                      <StatusBadge tone={tone}>{state}</StatusBadge>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <p className="text-xs text-muted-foreground">
        En rango de {formatNumber(min, 'percent')} a {formatNumber(max, 'percent')} % de la meta,
        según la organización.
      </p>
      <PlanMethod methods={calculation.methods} code="ADEQUACY" />
    </div>
  );
}

/** Lo que aporta un intercambio del grupo, en una línea. */
export function perExchange(group: ListGroup): string {
  return `${formatNumber(group.choG, 'grams')} g carb. · ${formatNumber(group.proteinG, 'grams')} g prot. · ${formatNumber(group.fatG, 'grams')} g grasa · ${formatNumber(group.kcal, 'kcal')} kcal`;
}

/**
 * Intercambios del día por grupo (RN-E08). renderServings cambia la celda por un campo en el editor; sin ella se ve el
 * número, con «a mano» si el profesional cambió lo que daba el método.
 */
export function ExchangeTable({
  groups,
  calculation,
  renderServings,
}: {
  groups: readonly ListGroup[];
  calculation: Calculation;
  renderServings?: (code: ExchangeGroupCode) => ReactNode;
}) {
  const { totals } = calculation;
  return (
    <div className="flex flex-col gap-2">
      <TableScroll label="Intercambios del día">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Intercambios del día</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Grupo
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Un intercambio aporta
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Intercambios por día
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const exchange = calculation.exchanges.find((e) => e.groupCode === group.code);
              return (
                <tr key={group.code} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {group.name}
                  </th>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {perExchange(group)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {renderServings ? (
                      renderServings(group.code)
                    ) : (
                      <>
                        {formatNumber(exchange?.servings, 'exchanges')}
                        {exchange?.manual ? (
                          <span className="block text-xs text-muted-foreground">
                            a mano · el método daba {formatNumber(exchange.automatic, 'exchanges')}
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <p className="text-sm" data-testid="plan-totals">
        Total del plan:{' '}
        <strong className="tabular-nums">{formatNumber(totals.kcal, 'kcal')} kcal</strong>,{' '}
        <span className="tabular-nums">{formatNumber(totals.choG, 'grams')} g</span> de
        carbohidratos,{' '}
        <span className="tabular-nums">{formatNumber(totals.proteinG, 'grams')} g</span> de proteína
        y <span className="tabular-nums">{formatNumber(totals.fatG, 'grams')} g</span> de grasa.
      </p>
      <PlanMethod methods={calculation.methods} code="EXCHANGES_CLASSIC" />
    </div>
  );
}

/**
 * Intercambios de cada grupo en cada tiempo de comida (RN-E09): solo los grupos con intercambios en el día. Las
 * funciones render cambian la cabecera y las celdas por campos en el editor.
 */
export function SplitTable({
  groups,
  meals,
  calculation,
  manualSplit,
  renderHeader,
  renderCell,
}: {
  groups: readonly ListGroup[];
  meals: readonly {
    name: string;
    sharePct: string;
    servings: Partial<Record<ExchangeGroupCode, number>>;
  }[];
  calculation: Calculation;
  manualSplit: readonly ExchangeGroupCode[];
  renderHeader?: (group: ListGroup) => ReactNode;
  renderCell?: (code: ExchangeGroupCode, index: number) => ReactNode;
}) {
  const daily = (code: ExchangeGroupCode) =>
    calculation.exchanges.find((e) => e.groupCode === code)?.servings ?? 0;
  const shown = groups.filter((g) => daily(g.code) > 0);
  return (
    <div className="flex flex-col gap-2">
      <TableScroll label="Reparto por tiempos de comida">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Reparto por tiempos de comida</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Tiempo
              </th>
              {shown.map((group) => (
                <th
                  key={group.code}
                  scope="col"
                  className="px-3 py-2 text-right align-bottom font-medium"
                >
                  {renderHeader ? (
                    renderHeader(group)
                  ) : (
                    <>
                      {group.name}
                      {manualSplit.includes(group.code) ? (
                        <span className="block text-xs font-normal">a mano</span>
                      ) : null}
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meals.map((meal, index) => (
              <tr key={`${meal.name}-${String(index)}`} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {meal.name || `Tiempo ${String(index + 1)}`}
                  <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                    {meal.sharePct} %
                  </span>
                </th>
                {shown.map((group) => (
                  <td key={group.code} className="px-3 py-2 text-right tabular-nums">
                    {renderCell
                      ? renderCell(group.code, index)
                      : formatNumber(meal.servings[group.code] ?? 0, 'exchanges')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface">
              <th scope="row" className="px-3 py-2 text-left font-medium">
                Total del día
              </th>
              {shown.map((group) => (
                <td key={group.code} className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatNumber(daily(group.code), 'exchanges')}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      <PlanMethod methods={calculation.methods} code="MEAL_SPLIT_LARGEST_REMAINDER" />
    </div>
  );
}
