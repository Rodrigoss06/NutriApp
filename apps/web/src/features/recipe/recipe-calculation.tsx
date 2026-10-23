import { methodLabel, type RecipeCalculation } from '@nutricoach/contracts';
import { MethodBadge, Notice } from '@nutricoach/ui';
import { formatFactor, formatMeasureGrams } from '@/features/food/format';
import { NutrientTotalsTable, type NutrientTotalRow } from '@/features/food/nutrient-totals';

/**
 * Los nutrientes por porción de una receta como los calculó el motor, con su método (RN-D02): «al menos» con en
 * cuántos ingredientes falta, o «sin dato» si falta en todos (RN-I03, ADR-061). Con el peso cocido, el rendimiento y
 * los nutrientes por 100 g cocidos (RN-E12).
 */
export function RecipeCalculationView({ calculation }: { calculation: RecipeCalculation }) {
  const cooked = calculation.yieldFactor !== null;
  const rows = (core: boolean): NutrientTotalRow[] =>
    calculation.nutrients
      .filter((n) => n.core === core)
      .map((n) => ({
        code: n.code,
        name: n.name,
        unit: n.unit,
        value: n.perServing,
        known: n.knownPerServing,
        missing: n.missingIngredients,
        extra: n.per100gCooked,
      }));
  const table = (caption: string, core: boolean) => (
    <NutrientTotalsTable
      caption={caption}
      valueLabel="Por porción"
      {...(cooked ? { extraLabel: 'Por 100 g cocidos' } : {})}
      of={calculation.ingredientCount}
      rows={rows(core)}
    />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="tabular-nums">
          Ingredientes: {formatMeasureGrams(calculation.rawWeightG)}
          {calculation.yieldFactor === null
            ? null
            : ` · rendimiento ${formatFactor(calculation.yieldFactor)}`}
        </p>
        <MethodBadge
          label={methodLabel(calculation.methodCode)}
          code={calculation.methodCode}
          version={calculation.methodVersion}
        />
      </div>
      {calculation.issues.map((issue) => (
        <Notice
          key={`${issue.code}-${issue.message}`}
          tone={issue.severity === 'INFO' ? 'info' : 'warning'}
          title={issue.message}
          rule={issue.rule}
        />
      ))}
      {table('Energía y macronutrientes', true)}
      {table('Otros nutrientes', false)}
      <p className="text-sm text-muted-foreground">
        «Al menos»: a algunos ingredientes les falta ese valor en su fuente; se suma lo que sí se
        conoce. «Sin dato»: no lo trae ninguno.
      </p>
    </div>
  );
}
