import { EmptyState } from '@nutricoach/ui';
import { LayoutDashboard } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Inicio' };

export default function PanelHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      <EmptyState
        icon={LayoutDashboard}
        title="Tu panel está listo"
        description="Aquí verás las alertas de tus pacientes: días sin registros, adherencia baja, notas sin leer y la próxima cita."
      />
    </div>
  );
}
