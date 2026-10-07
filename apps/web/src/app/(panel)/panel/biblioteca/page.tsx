import { EmptyState } from '@nutricoach/ui';
import { Library } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Biblioteca' };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Biblioteca</h1>
      <EmptyState
        icon={Library}
        title="Todavía no hay nada aquí"
        description="Aquí estarán los alimentos, recetas y ejercicios de tu organización."
      />
    </div>
  );
}
