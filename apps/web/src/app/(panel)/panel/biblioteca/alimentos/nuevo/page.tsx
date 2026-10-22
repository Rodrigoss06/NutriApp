import type { NutrientCatalogResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { OwnFoodForm } from '@/features/food/own-food-form';
import { Section } from '@/features/patients/section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Nuevo alimento propio' };

/** Alimento propio de la organización (RN-I01): solo lo ve y lo edita ella. */
export default async function NewFoodPage() {
  const catalog = await serverApi<NutrientCatalogResponse>('/foods/nutrients');
  return (
    <Section
      title="Nuevo alimento propio"
      description="Solo lo ve tu organización. Los alimentos de referencia no se editan: para cambiar uno, crea el tuyo."
    >
      {catalog.ok ? (
        <OwnFoodForm nutrients={catalog.data.nutrients} />
      ) : (
        <Notice tone="danger" title="No pudimos cargar los nutrientes" />
      )}
    </Section>
  );
}
