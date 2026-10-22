import type { Metadata } from 'next';
import { FoodBrowser } from '@/features/food/food-browser';

export const metadata: Metadata = { title: 'Alimentos' };

/** Alimentos de referencia y propios de la organización (RF-38, RN-I01). */
export default function FoodsPage() {
  return <FoodBrowser />;
}
