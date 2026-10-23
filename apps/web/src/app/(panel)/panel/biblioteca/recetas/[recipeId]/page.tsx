import type { RecipeDetail } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RecipeDetailView } from '@/features/recipe/recipe-detail';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Receta' };

/** Una receta con sus ingredientes y sus nutrientes por porción (RF-21, RN-E12). */
export default async function RecipePage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;
  const recipe = await serverApi<RecipeDetail>(`/recipes/${encodeURIComponent(recipeId)}`);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/panel/biblioteca/recetas" className="text-sm text-brand-text underline">
        Volver a recetas
      </Link>
      {recipe.ok ? (
        <RecipeDetailView recipe={recipe.data} />
      ) : (
        <Notice
          tone={recipe.status === 404 || recipe.status === 400 ? 'warning' : 'danger'}
          title={
            recipe.status === 404 || recipe.status === 400
              ? 'No encontramos esa receta'
              : 'No pudimos cargar la receta'
          }
        />
      )}
    </div>
  );
}
