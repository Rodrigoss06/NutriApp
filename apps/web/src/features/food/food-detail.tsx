import type { FoodDetail, FoodNutrient } from '@nutricoach/contracts';
import { formatNumber, Notice, StatusBadge } from '@nutricoach/ui';
import { Section } from '@/features/patients/section';
import { TableScroll } from '@/features/shell/table-scroll';
import { formatFactor, formatMeasureGrams, formatPer100g } from './format';
import { FOOD_STATE_LABELS, VALUE_FLAG_LABELS } from './labels';
import { OwnFoodActions } from './own-food-actions';

/**
 * Un alimento con su fuente y edición (RN-I02), sus nutrientes por 100 g de parte comestible con «sin dato» distinto
 * de cero (RN-I03), sus medidas caseras y sus factores de cocción (RN-E12). Los de referencia no se editan (RN-I01).
 */
export function FoodDetailView({ food }: { food: FoodDetail }) {
  const core = food.nutrients.filter((n) => n.core);
  const others = food.nutrients.filter((n) => !n.core);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-xl font-semibold">{food.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[food.groupName, FOOD_STATE_LABELS[food.state]].filter(Boolean).join(' · ')}
          </p>
        </div>
        {food.own ? <StatusBadge tone="info">Propio de tu organización</StatusBadge> : null}
        <OwnFoodActions food={food} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Fuente</dt>
        <dd>
          {food.own
            ? 'Propio de la organización'
            : [food.source.name, food.source.edition].filter(Boolean).join(', ')}
        </dd>
        {food.own ? (
          <>
            <dt className="text-muted-foreground">Parte comestible</dt>
            <dd className="tabular-nums">{formatNumber(food.ediblePortionPct, 'percent')} %</dd>
          </>
        ) : null}
      </dl>
      {food.tags.length > 0 ? (
        <Notice tone="info" title="Valores tomados de otra tabla">
          {food.tags.join(' · ')}
        </Notice>
      ) : null}

      <Section
        title="Composición por 100 g"
        description="De parte comestible. «Sin dato» es que la fuente no trae el valor: no es cero."
      >
        <NutrientTable caption="Energía y macronutrientes" nutrients={core} />
        <NutrientTable caption="Otros nutrientes" nutrients={others} />
      </Section>

      {food.measures.length > 0 ? (
        <Section
          title="Medidas caseras"
          description="El peso neto es la parte comestible; el bruto, el de compra."
        >
          <TableScroll label="Medidas caseras">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Medidas caseras</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Medida
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Peso neto
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Peso bruto
                  </th>
                </tr>
              </thead>
              <tbody>
                {food.measures.map((measure) => (
                  <tr key={measure.id} className="border-t border-border">
                    <td className="px-3 py-2">{measure.name}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {formatMeasureGrams(measure.grams)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {measure.grossGrams === null ? '—' : formatMeasureGrams(measure.grossGrams)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Section>
      ) : null}

      {food.cookingFactors.length > 0 ? (
        <Section
          title="Factores de cocción"
          description="Peso crudo = peso cocido × factor, para este alimento crudo."
        >
          <TableScroll label="Factores de cocción">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Factores de cocción</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Alimento
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Cocción
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Factor
                  </th>
                </tr>
              </thead>
              <tbody>
                {food.cookingFactors.map((factor) => (
                  <tr key={factor.id} className="border-t border-border">
                    <td className="px-3 py-2">{factor.name}</td>
                    <td className="px-3 py-2">{factor.cookingMethod}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatFactor(factor.cookedToRawFactor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Section>
      ) : null}
    </div>
  );
}

function NutrientTable({
  caption,
  nutrients,
}: {
  caption: string;
  nutrients: readonly FoodNutrient[];
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
            <th scope="col" className="w-32 px-3 py-2 text-right font-medium">
              Por 100 g
            </th>
            <th scope="col" className="w-48 px-3 py-2 font-medium">
              Nota
            </th>
          </tr>
        </thead>
        <tbody>
          {nutrients.map((nutrient) => (
            <tr key={nutrient.code} className="border-t border-border">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {nutrient.name}
              </th>
              <td
                className={
                  nutrient.valuePer100g === null
                    ? 'px-3 py-2 text-right whitespace-nowrap text-muted-foreground italic'
                    : 'px-3 py-2 text-right whitespace-nowrap tabular-nums'
                }
              >
                {formatPer100g(nutrient.valuePer100g, nutrient.code, nutrient.unit)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {nutrient.flag && nutrient.flag !== 'MISSING'
                  ? VALUE_FLAG_LABELS[nutrient.flag]
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
