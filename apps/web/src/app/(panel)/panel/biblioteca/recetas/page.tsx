import type { Metadata } from 'next';
import { RecipeBrowser } from '@/features/recipe/recipe-browser';

export const metadata: Metadata = { title: 'Recetas' };

/** El recetario de la organización (RF-21). */
export default function RecipesPage() {
  return <RecipeBrowser />;
}
