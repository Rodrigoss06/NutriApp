import {
  methodLabel,
  type CompositionPlanPreview,
  type ItemTotals,
  type NutrientTotal,
} from '@nutricoach/contracts';
import { formatNumber, MethodBadge, StatusBadge, type Tone } from '@nutricoach/ui';
import { formatTotalWithGaps } from '@/features/food/format';
import { NutrientTotalsTable } from '@/features/food/nutrient-totals';
import { PlanMethod } from '@/features/nutrition-plan/plan-tables';
import { TableScroll } from '@/features/shell/table-scroll';
import { DAY_NAMES } from './draft';

type Nutrients = CompositionPlanPreview['nutrients'];
type Adequacy = CompositionPlanPreview['adequacy'];
type Targets = CompositionPlanPreview['targets'];

/** Las cuatro metas del día con el código INFOODS de cada una. */
export const MACROS = [
  { key: 'kcal', label: 'Energía', target: 'kcal', code: 'ENERC_KCAL', unit: 'kcal' },
  { key: 'cho', label: 'Carbohidratos', target: 'choG', code: 'CHOCDF', unit: 'g' },
  { key: 'protein', label: 'Proteína', target: 'proteinG', code: 'PROCNT', unit: 'g' },
  { key: 'fat', label: 'Grasa', target: 'fatG', code: 'FAT', unit: 'g' },
] as const;

const NONE: NutrientTotal = { value: 0, known: 0, missing: 0 };

/**
 * Energía y macronutrientes de un tiempo, una celda o un día, en una línea (RN-E16): «al menos» con en cuántos
 * alimentos falta, como en el recetario (ADR-061).
 */
export function MacroSummary({ totals, label }: { totals: ItemTotals; label: string }) {
  return (
    <dl aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {MACROS.map((macro) => {
        const { text, gap } = formatTotalWithGaps(
          totals.nutrients[macro.code] ?? NONE,
          totals.ingredientCount,
          macro.code,
          macro.unit,
        );
        return (
          <div key={macro.key} className="flex gap-1">
            <dt className="text-muted-foreground">{macro.label}</dt>
            <dd className="tabular-nums">
              {text}
              {gap ? <span className="text-xs text-muted-foreground"> ({gap})</span> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Todos los nutrientes de un día con su método (RN-D02): los principales y los demás, en dos tablas. */
export function NutrientTables({
  totals,
  nutrients,
  valueLabel,
  caption,
}: {
  totals: ItemTotals;
  nutrients: Nutrients;
  valueLabel: string;
  /** Lo que antecede a cada tabla: «Lunes» o «Día». */
  caption: string;
}) {
  const rows = (core: boolean) =>
    nutrients
      .filter((n) => n.core === core)
      .map((n) => ({
        code: n.code,
        name: n.name,
        unit: n.unit,
        ...(totals.nutrients[n.code] ?? NONE),
      }));
  return (
    <div className="flex flex-col gap-4">
      <MethodBadge label={methodLabel('RECIPE_NUTRIENTS')} code="RECIPE_NUTRIENTS" />
      <NutrientTotalsTable
        caption={`${caption}: energía y macronutrientes`}
        valueLabel={valueLabel}
        of={totals.ingredientCount}
        rows={rows(true)}
      />
      <NutrientTotalsTable
        caption={`${caption}: otros nutrientes`}
        valueLabel={valueLabel}
        of={totals.ingredientCount}
        rows={rows(false)}
      />
      <p className="text-sm text-muted-foreground">
        «Al menos»: a algunos alimentos les falta ese valor en su fuente; se suma lo que sí se
        conoce. «Sin dato»: no lo trae ninguno.
      </p>
    </div>
  );
}

function adequacyState(
  pct: number,
  missing: number,
  [min, max]: readonly [number, number],
): { tone: Tone; label: string } {
  if (pct > max) return { tone: 'warning', label: 'Por encima' };
  // Con datos que faltan, lo conocido es un mínimo: no se sabe si está en rango.
  if (missing > 0) return { tone: 'info', label: 'Faltan datos' };
  return pct < min
    ? { tone: 'warning', label: 'Por debajo' }
    : { tone: 'success', label: 'En rango' };
}

/**
 * Adecuación de una composición o un menú contra las metas exactas, con el rango de la organización (RN-E10). Se
 * calcula con lo conocido: si a un alimento le falta el macronutriente, «al menos» y «Faltan datos» (ADR-062). En el
 * menú, la del promedio de la semana con los días en rango.
 */
export function FoodAdequacyTable({
  targets,
  adequacy,
  planned,
  plannedLabel,
  of,
  methods,
}: {
  targets: Targets;
  adequacy: Adequacy;
  /** Lo del día o el promedio de la semana, por código INFOODS. */
  planned: (code: string) => NutrientTotal;
  plannedLabel: string;
  /** De cuántos alimentos (o días) sale lo planeado. */
  of: number;
  methods: CompositionPlanPreview['methods'];
}) {
  const [min, max] = adequacy.rangePct;
  const days = adequacy.kcal.days;
  const noun = days > 1 ? 'días' : 'alimentos';
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
                {plannedLabel} y meta
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Adecuación
              </th>
            </tr>
          </thead>
          <tbody>
            {MACROS.map((macro) => {
              const value = adequacy[macro.key];
              const state = adequacyState(value.pct, value.missing, adequacy.rangePct);
              const total = formatTotalWithGaps(planned(macro.code), of, macro.code, macro.unit);
              const target =
                macro.unit === 'kcal'
                  ? `${formatNumber(targets[macro.target], 'kcal')} kcal`
                  : `${formatNumber(targets[macro.target], 'grams')} g`;
              const pct = `${formatNumber(value.pct, 'percent')} %`;
              return (
                <tr
                  key={macro.key}
                  className="border-t border-border align-top"
                  data-adequacy={macro.key}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {macro.label}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="block whitespace-nowrap">{total.text}</span>
                    <span className="block text-xs whitespace-nowrap text-muted-foreground">
                      de {target}
                    </span>
                    {total.gap ? (
                      <span className="block text-xs text-muted-foreground">{total.gap}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="flex flex-col items-end gap-1">
                      <span className="whitespace-nowrap tabular-nums">
                        {value.missing > 0 && value.pct > 0 ? `al menos ${pct}` : pct}
                      </span>
                      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                      {days > 1 ? (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {value.daysInRange} de {days} días en rango
                        </span>
                      ) : null}
                      {value.missing > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          falta en {value.missing} de {value.of} {noun}
                        </span>
                      ) : null}
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
        según la organización. Con datos que faltan, la adecuación es un mínimo.
      </p>
      <PlanMethod methods={methods} code="ADEQUACY" />
    </div>
  );
}

/**
 * La semana del menú: energía y macronutrientes de cada día con la opción A de cada tiempo, y el promedio de los siete
 * días: «sin dato» si falta en alguno, con lo conocido y en cuántos días falta (ADR-062).
 */
export function WeekTable({
  days,
  weeklyAverage,
}: {
  days: readonly ItemTotals[];
  weeklyAverage: Readonly<
    Record<string, { value: number | null; known: number; missingDays: number }>
  >;
}) {
  const cell = (total: NutrientTotal, of: number, code: string, unit: string) => {
    const { text, gap } = formatTotalWithGaps(total, of, code, unit);
    return (
      <>
        <span className="whitespace-nowrap">{text}</span>
        {gap ? <span className="block text-xs text-muted-foreground">{gap}</span> : null}
      </>
    );
  };
  return (
    <TableScroll label="Resumen de la semana">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Resumen de la semana, con la opción A de cada tiempo</caption>
        <thead className="bg-surface text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Día
            </th>
            {MACROS.map((macro) => (
              <th key={macro.key} scope="col" className="px-3 py-2 text-right font-medium">
                {macro.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day, d) => (
            <tr key={DAY_NAMES[d]} className="border-t border-border">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {DAY_NAMES[d]}
              </th>
              {MACROS.map((macro) => (
                <td key={macro.key} className="px-3 py-2 text-right tabular-nums">
                  {cell(
                    day.nutrients[macro.code] ?? NONE,
                    day.ingredientCount,
                    macro.code,
                    macro.unit,
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-border font-medium">
            <th scope="row" className="px-3 py-2 text-left">
              Promedio
            </th>
            {MACROS.map((macro) => {
              const average = weeklyAverage[macro.code];
              return (
                <td key={macro.key} className="px-3 py-2 text-right tabular-nums">
                  {cell(
                    average
                      ? { value: average.value, known: average.known, missing: average.missingDays }
                      : NONE,
                    days.length,
                    macro.code,
                    macro.unit,
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </TableScroll>
  );
}
