import type { MeApp, MeToday } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallApp } from '@/features/patient-app/install-app';
import { NotesForm } from '@/features/patient-app/notes-form';
import { WeightForm } from '@/features/patient-app/weight-form';
import { LogoutButton } from '@/features/session/session-actions';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Más' };

/** Más: escribir a tu equipo (RN-G13), tu peso si está habilitado, instalar la app (RF-27) y salir. */
export default async function Page() {
  const [today, app] = await Promise.all([
    serverApi<MeToday>('/me/today'),
    serverApi<MeApp>('/me/app'),
  ]);
  if (!today.ok || !app.ok) return <Notice tone="danger" title="No pudimos cargar esta sección" />;
  const sections = new Set(app.data.enabledSections);
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
      {app.data.allowWeightLog ? (
        <section aria-labelledby="peso" className="flex flex-col gap-2">
          <h2 id="peso" className="text-lg font-semibold">
            Peso
          </h2>
          <WeightForm localDate={today.data.localDate} editable />
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
