import type { PatternChoiceListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { PatternChoiceTable } from '@/features/exercise/pattern-choice-table';
import { Section } from '@/features/patients/section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Patrón y nivel' };

/** El ejercicio sugerido por patrón y nivel: lo usa la propuesta de rutina (RN-F14, 07 §5). */
export default async function PatternChoicesPage() {
  const response = await serverApi<PatternChoiceListResponse>('/exercise-pattern-choices');
  if (!response.ok) return <Notice tone="danger" title="No pudimos cargar la tabla" />;
  return (
    <Section
      title="Ejercicio sugerido por patrón y nivel"
      description="La propuesta de rutina elige de aquí el ejercicio de cada bloque. Cambiar una fila solo cuenta para las propuestas siguientes."
    >
      <PatternChoiceTable initial={response.data.choices} />
    </Section>
  );
}
