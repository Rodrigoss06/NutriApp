import { EmptyState } from '@nutricoach/ui';
import { CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hoy' };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Hoy</h1>
      <EmptyState
        icon={CalendarCheck}
        title="Tu día empieza aquí"
        description="Cuando tu profesional publique tu plan, verás tus comidas, tu agua y tu sesión de hoy."
      />
    </div>
  );
}
