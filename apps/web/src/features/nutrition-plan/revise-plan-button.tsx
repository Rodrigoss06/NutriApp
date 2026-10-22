'use client';

import type { NutritionPlan } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problem';

/**
 * Versión nueva de un plan publicado (02 §7, RN-E15): un borrador con lo mismo, que se edita y al publicarse reemplaza
 * al vigente. Si el plan ya tiene un borrador, la API responde 409 con su id y se abre ese.
 */
export function RevisePlanButton({ patientId, planId }: { patientId: string; planId: string }) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const open = (id: string) => {
    router.push(`/panel/pacientes/${patientId}/dieta/${id}`);
  };
  const revise = useMutation({
    mutationFn: () =>
      apiFetch<NutritionPlan>(`/nutrition-plans/${planId}/revisions`, { method: 'POST' }),
    onSuccess: ({ id }) => {
      open(id);
    },
    onError: (error) => {
      const draftId = error instanceof ApiError ? error.problem.details?.['draftId'] : undefined;
      if (error instanceof ApiError && error.code === 'NC-NUT-013' && typeof draftId === 'string') {
        open(draftId);
      }
    },
  });
  const pendingDraft = revise.error instanceof ApiError && revise.error.code === 'NC-NUT-013';
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          disabled={!canWrite || revise.isPending}
          onClick={() => {
            revise.mutate();
          }}
        >
          {revise.isPending ? 'Creando…' : 'Crear versión nueva'}
        </Button>
      </div>
      {pendingDraft ? null : <FormError error={revise.error} title="No se creó la versión" />}
    </div>
  );
}
