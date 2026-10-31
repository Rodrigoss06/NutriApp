import type { ExerciseCatalogResponse, ExerciseDetail } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnExerciseForm } from '@/features/exercise/own-exercise-form';
import { Section } from '@/features/patients/section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Editar ejercicio' };

/** Editar un ejercicio propio (RN-I01): los programas publicados no cambian, llevan su copia (RN-F12). */
export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const path = `/exercises/${encodeURIComponent(exerciseId)}`;
  const [exercise, catalog] = await Promise.all([
    serverApi<ExerciseDetail>(path),
    serverApi<ExerciseCatalogResponse>('/exercises/catalog'),
  ]);
  if (!exercise.ok || !catalog.ok) {
    return <Notice tone="warning" title="No encontramos ese ejercicio" />;
  }
  if (!exercise.data.own) {
    return (
      <Notice tone="warning" title="Los ejercicios de referencia no se editan">
        <Link href="/panel/biblioteca/ejercicios/nuevo" className="underline">
          Crea uno propio
        </Link>
      </Notice>
    );
  }
  return (
    <Section
      title={`Editar ${exercise.data.name}`}
      description="Los programas ya publicados no cambian: llevan su propia copia."
    >
      <OwnExerciseForm catalog={catalog.data} exercise={exercise.data} />
    </Section>
  );
}
