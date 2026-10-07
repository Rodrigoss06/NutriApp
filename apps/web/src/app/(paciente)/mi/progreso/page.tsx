import { EmptyState } from '@nutricoach/ui';
import { TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Progreso' };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Progreso</h1>
      <EmptyState
        icon={TrendingUp}
        title="Aún no hay evaluaciones"
        description="Tu evolución aparecerá aquí después de tu primera evaluación."
      />
    </div>
  );
}
