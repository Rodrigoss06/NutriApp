'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';

export interface PlanDraftEditor<Plan, Preview, Body> {
  readonly plan: Plan;
  readonly dirty: boolean;
  /** Lo que calculó el motor con lo que se está escribiendo, si cambió algo. */
  readonly preview: Preview | undefined;
  readonly previewError: unknown;
  /** La vista previa ya refleja lo escrito. */
  readonly upToDate: boolean;
  readonly save: UseMutationResult<Plan, Error, Body>;
  readonly publish: UseMutationResult<Plan, Error, void>;
}

/**
 * El borrador de un plan de cualquier modalidad mientras se edita: la vista previa con el motor (RN-E10), guardar con
 * If-Match y publicar (RN-E15). body es el cuerpo de PUT que sale del borrador, o null mientras algo no sirva;
 * initialBody, el de lo guardado. Avisa antes de salir con cambios sin guardar.
 */
export function usePlanDraft<Plan extends { id: string; version: number }, Preview, Body>(
  initial: Plan,
  body: Body | null,
  initialBody: Body | null,
): PlanDraftEditor<Plan, Preview, Body> {
  const router = useRouter();
  const [plan, setPlan] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initialBody));
  // El texto del cuerpo, no el objeto: se compara por valor y la espera no se reinicia en cada render.
  const key = body === null ? null : JSON.stringify(body);
  const dirty = key !== saved;
  const debouncedKey = useDebounced(key, 300);
  const preview = useQuery({
    queryKey: ['nutrition-plan-preview', plan.id, debouncedKey],
    queryFn: () =>
      apiFetch<Preview>(`/nutrition-plans/${plan.id}/preview`, {
        method: 'POST',
        body: JSON.parse(debouncedKey ?? 'null') as unknown,
      }),
    enabled: debouncedKey !== null && debouncedKey !== saved,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const upToDate = !dirty || (key === debouncedKey && preview.isSuccess && !preview.isFetching);

  const save = useMutation({
    mutationFn: (payload: Body) =>
      apiFetch<Plan>(`/nutrition-plans/${plan.id}`, {
        method: 'PUT',
        body: payload,
        headers: { 'If-Match': `"${String(plan.version)}"` },
      }),
    onSuccess: (next, payload) => {
      setPlan(next);
      setSaved(JSON.stringify(payload));
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      apiFetch<Plan>(`/nutrition-plans/${plan.id}/publish`, {
        method: 'POST',
        headers: { 'If-Match': `"${String(plan.version)}"` },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  return {
    plan,
    dirty,
    preview: dirty ? preview.data : undefined,
    previewError: dirty && body !== null && preview.isError ? preview.error : null,
    upToDate,
    save,
    publish,
  };
}
