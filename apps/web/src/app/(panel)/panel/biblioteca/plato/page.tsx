import type { Metadata } from 'next';
import { PlateBuilder } from '@/features/food/plate-builder';

export const metadata: Metadata = { title: 'Armar un plato' };

/** Lo que aporta un plato, con medidas caseras o en gramos (RF-20 adelantado, RN-E12, RN-E16). */
export default function PlatePage() {
  return <PlateBuilder />;
}
