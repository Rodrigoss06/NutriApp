import type { ExerciseDetail } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ExerciseDetailView } from '@/features/exercise/exercise-detail';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Ejercicio' };

/** La ficha de un ejercicio de la biblioteca (RF-25). */
export default async function ExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const exercise = await serverApi<ExerciseDetail>(`/exercises/${encodeURIComponent(exerciseId)}`);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/panel/biblioteca/ejercicios" className="text-sm text-brand-text underline">
        Volver a ejercicios
      </Link>
      {exercise.ok ? (
        <ExerciseDetailView exercise={exercise.data} />
      ) : (
        <Notice
          tone={exercise.status === 404 || exercise.status === 400 ? 'warning' : 'danger'}
          title={
            exercise.status === 404 || exercise.status === 400
              ? 'No encontramos ese ejercicio'
              : 'No pudimos cargar el ejercicio'
          }
        />
      )}
    </div>
  );
}
