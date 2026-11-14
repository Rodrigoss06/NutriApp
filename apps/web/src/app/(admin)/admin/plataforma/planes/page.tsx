import type { PlanListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { PlanEditor } from '@/features/platform/plan-editor';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Planes' };

/**
 * Los tramos de membresía (N9, RF-39): crear y cambiar sus límites y su precio. Lo que cambia aquí vale para las suscripciones
 * nuevas: las vigentes tienen sus límites congelados (RN-A03).
 */
export default async function PlansPage() {
  const plans = await serverApi<PlanListResponse>('/platform/plans');
  if (!plans.ok) return <Notice tone="danger" title="No pudimos cargar los planes" />;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Planes</h1>
        <p className="text-sm text-muted-foreground">
          Los cambios valen para las suscripciones nuevas y las renovaciones; las vigentes conservan
          sus límites.
        </p>
      </div>
      <PlanEditor plans={plans.data.plans} />
    </>
  );
}
