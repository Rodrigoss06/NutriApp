import { EmptyState } from '@nutricoach/ui';
import { Menu } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Más' };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Más</h1>
      <EmptyState
        icon={Menu}
        title="Tus notas y materiales"
        description="Aquí estarán tus notas, el material educativo y los ajustes de la app."
      />
    </div>
  );
}
