import type { FoodDetail, RecipeDetail } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import type { MeasureOption } from '@/features/recipe/draft';
import { RecipeForm } from '@/features/recipe/recipe-form';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Editar receta' };

/** Editar una receta (RF-21): vuelve con las medidas caseras de cada alimento para cambiar la cantidad. */
export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const recipe = await serverApi<RecipeDetail>(`/recipes/${encodeURIComponent(recipeId)}`);
  if (!recipe.ok) return <Notice tone="danger" title="No pudimos cargar la receta" />;
  const foodIds = [...new Set(recipe.data.ingredients.map((i) => i.foodId))];
  const foods = await Promise.all(foodIds.map((id) => serverApi<FoodDetail>(`/foods/${id}`)));
  const measures: Record<string, MeasureOption[]> = {};
  for (const food of foods) {
    if (food.ok) {
      measures[food.data.id] = food.data.measures.map(({ id, name, grams }) => ({
        id,
        name,
        grams,
      }));
    }
  }
  return (
    <Section title={`Editar: ${recipe.data.name}`}>
      <RecipeForm recipe={recipe.data} measures={measures} />
    </Section>
  );
}
