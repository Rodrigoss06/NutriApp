'use client';

import type { RecipeDetail } from '@nutricoach/contracts';
import { Button, buttonVariants } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';

/**
 * Editar, archivar y restaurar, con la organización activa (RN-A02); la API decide igual. Una receta no se borra:
 * archivada deja de ofrecerse al prescribir.
 */
export function RecipeActions({ recipe }: { recipe: RecipeDetail }) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const archived = recipe.status === 'ARCHIVED';
  const toggle = useMutation({
    mutationFn: () =>
      apiFetch<RecipeDetail>(`/recipes/${recipe.id}/${archived ? 'restore' : 'archive'}`, {
        method: 'POST',
        headers: { 'If-Match': `"${String(recipe.version)}"` },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  if (!canWrite) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/panel/biblioteca/recetas/${recipe.id}/editar`}
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
        title={archived ? 'No se restauró la receta' : 'No se archivó la receta'}
      />
    </div>
  );
}
