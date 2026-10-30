import type { ExerciseCatalogResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { ExerciseBrowser } from '@/features/exercise/exercise-browser';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Ejercicios' };

/** La biblioteca de ejercicios, de referencia y propios de la organización (RF-25, RN-I01). */
export default async function ExercisesPage() {
  const catalog = await serverApi<ExerciseCatalogResponse>('/exercises/catalog');
  if (!catalog.ok) return <Notice tone="danger" title="No pudimos cargar la biblioteca" />;
  return <ExerciseBrowser catalog={catalog.data} />;
}
