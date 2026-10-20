import type { AccountResponse } from '@nutricoach/contracts';
import { ContourBackground, EmptyState } from '@nutricoach/ui';
import { CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Hoy' };

/**
 * Hoy, la pantalla de inicio de la app del paciente: la cabecera destacada con el fondo de curvas y el saludo. El
 * título no se anima: es lo primero que se pinta (RNF-03). El plan del día llega en P13.
 */
export default async function Page() {
  const account = await serverApi<AccountResponse>('/account');
  const firstName = account.ok ? account.data.displayName.split(' ')[0] : null;
  return (
    <div className="flex flex-col gap-4">
      <section className="relative overflow-hidden rounded-xl bg-hero px-5 pt-12 pb-6 text-hero-foreground">
        <ContourBackground seed={7.4} controls="top-right" />
        <div className="relative flex flex-col gap-1">
          <h1 className="font-display text-4xl">Hoy</h1>
          {firstName ? <p className="text-hero-muted">Hola, {firstName}.</p> : null}
        </div>
      </section>
      <EmptyState
        icon={CalendarCheck}
        title="Tu día empieza aquí"
        description="Cuando tu profesional publique tu plan, verás tus comidas, tu agua y tu sesión de hoy."
      />
    </div>
  );
}
