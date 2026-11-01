import type { ReactNode } from 'react';
import { TrainingTabs } from '@/features/training/training-tabs';

/** Entrenamiento del expediente (RF-41, RF-26): el resumen de las llaves, el perfil, el cribado, la postura, las pruebas físicas y los programas. */
export default async function TrainingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return (
    <div className="flex flex-col gap-6">
      <TrainingTabs patientId={patientId} />
      {children}
    </div>
  );
}
