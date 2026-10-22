import type { FoodDetail } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FoodDetailView } from '@/features/food/food-detail';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Alimento' };

/** Un alimento con su fuente, sus nutrientes, sus medidas caseras y sus factores de cocción (RN-I02, RN-I03). */
export default async function FoodPage({ params }: { params: Promise<{ foodId: string }> }) {
  const { foodId } = await params;
  const food = await serverApi<FoodDetail>(`/foods/${encodeURIComponent(foodId)}`);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/panel/biblioteca/alimentos" className="text-sm text-brand-text underline">
        Volver a alimentos
      </Link>
      {food.ok ? (
        <FoodDetailView food={food.data} />
      ) : (
        <Notice
          tone={food.status === 404 || food.status === 400 ? 'warning' : 'danger'}
          title={
            food.status === 404 || food.status === 400
              ? 'No encontramos ese alimento'
              : 'No pudimos cargar el alimento'
          }
        />
      )}
    </div>
  );
}
