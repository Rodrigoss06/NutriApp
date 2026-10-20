import type { AccountResponse, OrganizationResponse } from '@nutricoach/contracts';
import { Button, ContourBackground, EmptyState, enterStyle } from '@nutricoach/ui';
import { LayoutDashboard, Search, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { pluralLabel } from '@/features/organization/labels';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Inicio' };

/** Saludo según la hora de la organización: la del consultorio, no la del servidor. */
function greeting(timezone: string, now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('es-PE', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(now),
  );
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Inicio del panel (ADR-051): la zona destacada con el fondo de curvas, el saludo y lo que se hace más seguido.
 * Las alertas de los pacientes llegan con la analítica (RF-34, P14).
 */
export default async function PanelHomePage() {
  const [account, organization] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    serverApi<OrganizationResponse>('/organization'),
  ]);
  const now = new Date();
  const timezone = organization.ok ? organization.data.timezone : 'America/Lima';
  const label = organization.ok ? organization.data.patientLabel : 'Paciente';
  const firstName = account.ok ? account.data.displayName.split(' ')[0] : null;
  const today = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(now);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-hero px-6 py-8 text-hero-foreground sm:px-10 sm:py-12">
        <ContourBackground seed={3.1} controls="top-right" />
        <div className="relative flex max-w-2xl flex-col gap-3">
          <p
            className="nc-enter font-label text-sm text-hero-muted first-letter:uppercase"
            style={enterStyle(0)}
          >
            {today}
          </p>
          <h1
            className="nc-enter font-display text-4xl text-balance sm:text-5xl"
            style={enterStyle(1)}
          >
            <span className="sr-only">Inicio: </span>
            {greeting(timezone, now)}
            {firstName ? `, ${firstName}` : ''}.
          </h1>
          <div className="nc-enter mt-4 flex flex-wrap gap-3" style={enterStyle(2)}>
            <Button asChild attention>
              <Link href="/panel/pacientes/nuevo">
                <UserPlus aria-hidden />
                Nuevo {label.toLowerCase()}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/panel/pacientes">
                <Search aria-hidden />
                Buscar en {pluralLabel(label).toLowerCase()}
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <EmptyState
        icon={LayoutDashboard}
        title="Aquí verás las alertas de tus pacientes"
        description="Días sin registros, adherencia baja, notas sin leer y la próxima cita. Llegan cuando los pacientes empiecen a registrar desde su app."
      />
    </div>
  );
}
