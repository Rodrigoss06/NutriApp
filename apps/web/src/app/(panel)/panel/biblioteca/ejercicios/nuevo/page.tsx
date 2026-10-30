import type { ExerciseCatalogResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { OwnExerciseForm } from '@/features/exercise/own-exercise-form';
import { Section } from '@/features/patients/section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Nuevo ejercicio propio' };

/** Ejercicio propio de la organización (RN-I01): solo lo ve y lo edita ella. */
export default async function NewExercisePage() {
  const catalog = await serverApi<ExerciseCatalogResponse>('/exercises/catalog');
  return (
    <Section
      title="Nuevo ejercicio propio"
      description="Solo lo ve tu organización. Los ejercicios de referencia no se editan: para cambiar uno, crea el tuyo."
    >
      {catalog.ok ? (
        <OwnExerciseForm catalog={catalog.data} />
      ) : (
        <Notice tone="danger" title="No pudimos cargar el catálogo" />
      )}
    </Section>
  );
}
