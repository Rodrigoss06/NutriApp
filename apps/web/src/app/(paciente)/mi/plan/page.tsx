import { EmptyState } from '@nutricoach/ui';
import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Plan' };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Plan</h1>
      <EmptyState
        icon={UtensilsCrossed}
        title="Aún no tienes un plan publicado"
        description="Tu plan de alimentación aparecerá aquí, por tiempos de comida."
      />
    </div>
  );
}
