import { EmptyState } from '@nutricoach/ui';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pacientes' };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pacientes</h1>
      <EmptyState
        icon={Users}
        title="Todavía no hay nada aquí"
        description="Aquí verás la lista de tus pacientes, con búsqueda por nombre o documento."
      />
    </div>
  );
}
