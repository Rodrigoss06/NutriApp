import { EmptyState } from '@nutricoach/ui';
import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Agenda' };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Agenda</h1>
      <EmptyState
        icon={CalendarDays}
        title="Todavía no hay nada aquí"
        description="Aquí verás tu disponibilidad y tus citas de la semana."
      />
    </div>
  );
}
