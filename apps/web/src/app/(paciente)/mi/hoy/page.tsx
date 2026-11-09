import type { AccountResponse, MeApp, MeDay, MePlan, MeToday } from '@nutricoach/contracts';
import { ContourBackground, EmptyState, Notice } from '@nutricoach/ui';
import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DayLog } from '@/features/patient-app/day-log';
import { DaySummary } from '@/features/patient-app/day-summary';
import { IndicationCard } from '@/features/patient-app/indication-card';
import { MealLogger } from '@/features/patient-app/meal-logger';
import { TodayPortions } from '@/features/patient-app/plan-day-profiles';
import { SessionCard } from '@/features/patient-app/session-card';
import { WaterCard } from '@/features/patient-app/water-card';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Hoy' };

/**
 * Hoy, la pantalla de inicio de la app del paciente (RF-27, RF-28): el saludo y el mensaje del día, la indicación del día con su
 * texto (RN-G15, 07 §9), lo que va del día frente a la meta, las comidas del plan para registrar en tres toques (RN-G06), el agua
 * y la sesión del día. El título no se anima: es lo primero que se pinta (RNF-03).
 */
export default async function Page() {
  const [account, today, app, plan] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    serverApi<MeToday>('/me/today'),
    serverApi<MeApp>('/me/app'),
    serverApi<MePlan>('/me/plan'),
  ]);
  if (!today.ok || !app.ok || !plan.ok) {
    return <Notice tone="danger" title="No pudimos cargar tu día" />;
  }
  const day = await serverApi<MeDay>(`/me/days/${today.data.localDate}`);
  const firstName = account.ok ? account.data.displayName.split(' ')[0] : null;
  const sections = new Set(app.data.enabledSections);
  const nutrition = sections.has('NUTRITION');
  return (
    <div className="flex flex-col gap-4">
      <section className="relative overflow-hidden rounded-xl bg-hero px-5 pt-12 pb-6 text-hero-foreground">
        <ContourBackground seed={7.4} controls="top-right" />
        <div className="relative flex flex-col gap-1">
          <h1 className="font-display text-4xl">Hoy</h1>
          {firstName ? <p className="text-hero-muted">Hola, {firstName}.</p> : null}
          {app.data.message ? (
            <p className="mt-2 text-lg">{app.data.message.body}</p>
          ) : app.data.welcomeMessage ? (
            <p className="mt-2 text-lg">{app.data.welcomeMessage}</p>
          ) : null}
        </div>
      </section>
      {sections.has('CHECKIN') ? <IndicationCard readiness={today.data.readiness} /> : null}
      {nutrition ? <DaySummary today={today.data} /> : null}
      {nutrition ? (
        <section aria-labelledby="comidas-hoy" className="flex flex-col gap-2">
          <h2 id="comidas-hoy" className="text-lg font-semibold">
            Registrar una comida
          </h2>
          {plan.data.plan ? (
            <>
              <TodayPortions plan={plan.data.plan} />
              <MealLogger meals={plan.data.plan.meals} localDate={today.data.localDate} editable />
            </>
          ) : (
            <EmptyState
              icon={UtensilsCrossed}
              title="Aún no tienes un plan publicado"
              description="Cuando tu profesional lo publique, registrarás tus comidas desde aquí."
            />
          )}
          <Link href="/mi/plan" className="flex min-h-touch items-center text-brand-text underline">
            Algo fuera del plan o tu plan completo
          </Link>
        </section>
      ) : null}
      {sections.has('HYDRATION') ? (
        <WaterCard
          localDate={today.data.localDate}
          waterMl={today.data.waterMl}
          targetMl={today.data.target?.waterMl ?? null}
          editable
        />
      ) : null}
      {sections.has('TRAINING') ? <SessionCard sessions={today.data.sessions} /> : null}
      {day.ok && (nutrition || sections.has('HYDRATION')) ? (
        <section aria-labelledby="registrado-hoy" className="flex flex-col gap-2">
          <h2 id="registrado-hoy" className="text-lg font-semibold">
            Lo que registraste hoy
          </h2>
          <DayLog day={day.data} />
        </section>
      ) : null}
    </div>
  );
}
