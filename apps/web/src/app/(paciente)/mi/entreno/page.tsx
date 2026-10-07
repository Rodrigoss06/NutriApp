import { EmptyState } from '@nutricoach/ui';
import { Dumbbell } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Entreno' };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Entreno</h1>
      <EmptyState
        icon={Dumbbell}
        title="Aún no tienes una rutina"
        description="Tu rutina aparecerá aquí con la sesión de cada día."
      />
    </div>
  );
}
