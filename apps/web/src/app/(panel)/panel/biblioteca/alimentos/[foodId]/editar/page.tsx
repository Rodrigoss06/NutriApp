import type { FoodDetail, NutrientCatalogResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { OwnFoodForm } from '@/features/food/own-food-form';
import { Section } from '@/features/patients/section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Editar alimento' };

/** Editar un alimento propio (RN-I01); los de referencia no se editan. */
export default async function EditFoodPage({ params }: { params: Promise<{ foodId: string }> }) {
  const { foodId } = await params;
  const [food, catalog] = await Promise.all([
    serverApi<FoodDetail>(`/foods/${encodeURIComponent(foodId)}`),
    serverApi<NutrientCatalogResponse>('/foods/nutrients'),
  ]);
  if (!food.ok || !catalog.ok) {
    return <Notice tone="danger" title="No pudimos cargar el alimento" />;
  }
  if (!food.data.own) {
    return (
      <Notice tone="info" title="Los alimentos de referencia no se editan" rule="RN-I01">
        Crea uno propio con los valores que necesitas.
      </Notice>
    );
  }
  return (
    <Section title={`Editar: ${food.data.name}`}>
      <OwnFoodForm nutrients={catalog.data.nutrients} food={food.data} />
    </Section>
  );
}
