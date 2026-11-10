import type { MeDay, MePlan, MeToday } from '@nutricoach/contracts';
import { formatNumber } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';
import { DayLog } from '@/features/patient-app/day-log';
import { MealLogger } from '@/features/patient-app/meal-logger';
import { OffPlanLogger } from '@/features/patient-app/off-plan-logger';
import { PlanDayProfiles } from '@/features/patient-app/plan-day-profiles';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Plan' };

/**
 * El plan vigente por tiempos de comida (RF-28), listo para registrar desde él (RN-G05, RN-G06), algo fuera del plan desde el
 * catálogo y lo registrado hoy. En el menú semanal, las opciones de hoy.
 */
export default async function Page() {
  const [today, plan] = await Promise.all([
    serverApi<MeToday>('/me/today'),
    serverApi<MePlan>('/me/plan'),
  ]);
  if (!today.ok || !plan.ok) return <Notice tone="danger" title="No pudimos cargar tu plan" />;
  const day = await serverApi<MeDay>(`/me/days/${today.data.localDate}`);
  const current = plan.data.plan;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Plan</h1>
      {current ? (
        <>
          {current.instructions ? (
            <Notice tone="info" title="Indicaciones de tu profesional">
              {current.instructions}
            </Notice>
          ) : null}
          {current.hydrationTargetMl ? (
            <p className="text-sm text-muted-foreground">
              Meta de agua: {formatNumber(current.hydrationTargetMl, 'grams')} ml al día.
            </p>
          ) : null}
          <PlanDayProfiles plan={current} todayCode={today.data.target?.profile?.code ?? null} />
          <MealLogger meals={current.meals} localDate={today.data.localDate} editable />
        </>
      ) : (
        <EmptyState
          icon={UtensilsCrossed}
          title="Aún no tienes un plan publicado"
          description="Tu plan de alimentación aparecerá aquí, por tiempos de comida."
        />
      )}
      <section aria-labelledby="fuera-plan" className="flex flex-col gap-2">
        <h2 id="fuera-plan" className="text-lg font-semibold">
          Algo fuera del plan
        </h2>
        <OffPlanLogger localDate={today.data.localDate} editable />
      </section>
      {day.ok ? (
        <section aria-labelledby="registrado-plan" className="flex flex-col gap-2">
          <h2 id="registrado-plan" className="text-lg font-semibold">
            Lo que registraste hoy
          </h2>
          <DayLog day={day.data} />
        </section>
      ) : null}
    </div>
  );
}
