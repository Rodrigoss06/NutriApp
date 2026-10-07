import { EmptyState } from '@nutricoach/ui';
import { Settings } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ajustes' };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <EmptyState
        icon={Settings}
        title="Todavía no hay nada aquí"
        description="Aquí configurarás tu organización, su marca y los métodos por defecto."
      />
    </div>
  );
}
