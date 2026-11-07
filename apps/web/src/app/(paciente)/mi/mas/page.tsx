import type { MeApp, MeConsents, MeScreening, MeToday } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallApp } from '@/features/patient-app/install-app';
import { MenstrualConsent } from '@/features/patient-app/menstrual-consent';
import { MyScreening } from '@/features/patient-app/my-screening';
import { NotesForm } from '@/features/patient-app/notes-form';
import { WeightForm } from '@/features/patient-app/weight-form';
import { LogoutButton } from '@/features/session/session-actions';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Más' };

/**
 * Más: escribir a tu equipo (RN-G13), el material que te asignó (RF-30), tu peso si está habilitado, el seguimiento del ciclo menstrual (RN-G17) y el cribado de
 * seguridad (07 §3.2) si su sección está a la vista, instalar la app (RF-27) y salir.
 */
export default async function Page() {
  const [today, app, consents, screening] = await Promise.all([
    serverApi<MeToday>('/me/today'),
    serverApi<MeApp>('/me/app'),
    serverApi<MeConsents>('/me/consents'),
    serverApi<MeScreening>('/me/screening'),
  ]);
  if (!today.ok || !app.ok || !consents.ok || !screening.ok) {
    return <Notice tone="danger" title="No pudimos cargar esta sección" />;
  }
  const sections = new Set(app.data.enabledSections);
  const menstrual = new Map(consents.data.consents.map((consent) => [consent.purpose, consent]));
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Más</h1>
      {sections.has('NOTES') ? (
        <section aria-labelledby="notas" className="flex flex-col gap-2">
          <h2 id="notas" className="text-lg font-semibold">
            Notas
          </h2>
          <NotesForm localDate={today.data.localDate} editable />
        </section>
      ) : null}
      {sections.has('RESOURCES') ? (
        <section aria-labelledby="material" className="flex flex-col gap-2">
          <h2 id="material" className="text-lg font-semibold">
            Material
          </h2>
          <Link
            href="/mi/material"
            className="flex min-h-touch items-center text-brand-text underline"
          >
            Guías, artículos y videos de tu equipo
          </Link>
        </section>
      ) : null}
      {app.data.allowWeightLog ? (
        <section aria-labelledby="peso" className="flex flex-col gap-2">
          <h2 id="peso" className="text-lg font-semibold">
            Peso
          </h2>
          <WeightForm localDate={today.data.localDate} editable />
        </section>
      ) : null}
      {sections.has('CHECKIN') ? (
        <section aria-labelledby="ciclo" className="flex flex-col gap-2">
          <h2 id="ciclo" className="text-lg font-semibold">
            Seguimiento del ciclo menstrual
          </h2>
          <MenstrualConsent consent={menstrual.get('MENSTRUAL_TRACKING')} />
        </section>
      ) : null}
      {sections.has('TRAINING') ? (
        <section aria-labelledby="cribado" className="flex flex-col gap-2">
          <h2 id="cribado" className="text-lg font-semibold">
            Cribado de seguridad
          </h2>
          <MyScreening latest={screening.data.latest} />
        </section>
      ) : null}
      <section aria-labelledby="instalar" className="flex flex-col gap-2">
        <h2 id="instalar" className="text-lg font-semibold">
          Instalar la app
        </h2>
        <InstallApp />
      </section>
      <div className="flex flex-col gap-2">
        <Link href="/acerca" className="flex min-h-touch items-center text-brand-text underline">
          Acerca de la app y sus fuentes
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
}
