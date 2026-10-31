'use client';

import type { ExerciseDetail } from '@nutricoach/contracts';
import { Button, buttonVariants } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';

/**
 * Editar, archivar y restaurar solo existen para un ejercicio propio y con la organización activa (RN-I01, RN-A02); la
 * API decide igual. Archivado deja de ofrecerse al prescribir; los programas que ya lo usan lo conservan.
 */
export function ExerciseActions({ exercise }: { exercise: ExerciseDetail }) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const archived = exercise.status === 'ARCHIVED';
  const toggle = useMutation({
    mutationFn: () =>
      apiFetch<ExerciseDetail>(`/exercises/${exercise.id}/${archived ? 'restore' : 'archive'}`, {
        method: 'POST',
        headers: { 'If-Match': `"${String(exercise.version)}"` },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  if (!exercise.own || !canWrite) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/panel/biblioteca/ejercicios/${exercise.id}/editar`}
          className={buttonVariants({ variant: 'secondary' })}
        >
          <Pencil aria-hidden />
          Editar
        </Link>
        <Button
          variant="ghost"
          disabled={toggle.isPending}
          onClick={() => {
            toggle.mutate();
          }}
        >
          {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {archived ? 'Restaurar' : 'Archivar'}
        </Button>
      </div>
      <FormError
        error={toggle.error}
        title={archived ? 'No se restauró el ejercicio' : 'No se archivó el ejercicio'}
      />
    </div>
  );
}
