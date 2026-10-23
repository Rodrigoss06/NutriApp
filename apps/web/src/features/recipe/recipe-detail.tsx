import type { RecipeDetail } from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { formatMeasureGrams, formatServings } from '@/features/food/format';
import { FOOD_STATE_LABELS } from '@/features/food/labels';
import { Section } from '@/features/patients/section';
import { TableScroll } from '@/features/shell/table-scroll';
import { RecipeActions } from './recipe-actions';
import { RecipeCalculationView } from './recipe-calculation';

/** Una receta con sus ingredientes en su estado (RN-E12) y sus nutrientes por porción del motor (RF-21). */
export function RecipeDetailView({ recipe }: { recipe: RecipeDetail }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-xl font-semibold">{recipe.name}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            Rinde {formatServings(recipe.servings)}
            {recipe.cookedWeightG === null
              ? null
              : ` · ${formatMeasureGrams(recipe.cookedWeightG)} cocida`}
            {recipe.tags.length > 0 ? ` · ${recipe.tags.join(', ')}` : null}
          </p>
        </div>
        {recipe.status === 'ARCHIVED' ? <StatusBadge tone="info">Archivada</StatusBadge> : null}
        <RecipeActions recipe={recipe} />
      </div>

      <Section title="Ingredientes" description="En gramos de parte comestible y en su estado.">
        <TableScroll label="Ingredientes">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Ingredientes</caption>
            <thead className="bg-surface text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Alimento
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Medida
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Gramos
                </th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((ingredient) => (
                <tr key={ingredient.position} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/panel/biblioteca/alimentos/${ingredient.foodId}`}
                      className="text-brand-text underline"
                    >
                      {ingredient.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{FOOD_STATE_LABELS[ingredient.state]}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {ingredient.householdText ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatMeasureGrams(ingredient.grams)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Section>

      {recipe.instructions ? (
        <Section title="Preparación">
          <p className="whitespace-pre-line">{recipe.instructions}</p>
        </Section>
      ) : null}

      <Section title="Nutrientes por porción">
        <RecipeCalculationView calculation={recipe.calculation} />
      </Section>
    </div>
  );
}
