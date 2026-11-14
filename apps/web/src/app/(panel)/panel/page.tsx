import type {
  AccountResponse,
  AgendaResponse,
  OrganizationResponse,
  OverviewResponse,
  PatientListResponse,
} from '@nutricoach/contracts';
import { Button, ContourBackground, enterStyle, Notice } from '@nutricoach/ui';
import { Search, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { alertFilter, namesById } from '@/features/analytics/overview-view';
import { PatientAlerts } from '@/features/analytics/patient-alerts';
import { agendaViewer, patientNamesOf } from '@/features/agenda/server';
import { TodayAgenda } from '@/features/agenda/today-agenda';
import { pluralLabel } from '@/features/organization/labels';
import { serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/dates';

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

/** Los nombres de los pacientes con alertas, de /patients: analytics no lee nombres (ADR-064). */
async function patientNames(overview: OverviewResponse): Promise<ReadonlyMap<string, string>> {
  if (overview.patients.length === 0) return new Map();
  const ids = overview.patients.map((patient) => patient.patientId).join(',');
  const list = await serverApi<PatientListResponse>(`/patients?ids=${ids}&limit=100`);
  return list.ok ? namesById(list.data.patients) : new Map();
}

/**
 * Inicio del panel (ADR-051): la zona destacada con el fondo de curvas, el saludo y lo que se hace más seguido; debajo, la agenda
 * de hoy (RF-37, ADR-125) y las alertas de los pacientes con su próxima cita (RF-34, ADR-093).
 */
export default async function PanelHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = alertFilter((await searchParams).alerta);
  const [account, organization, overview] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    serverApi<OrganizationResponse>('/organization'),
    serverApi<OverviewResponse>(`/analytics/overview?limit=50${filter ? `&alert=${filter}` : ''}`),
  ]);
  const names = overview.ok ? await patientNames(overview.data) : new Map<string, string>();
  const now = new Date();
  const timezone = organization.ok ? organization.data.timezone : 'America/Lima';
  const label = organization.ok ? organization.data.patientLabel : 'Paciente';
  const firstName = account.ok ? account.data.displayName.split(' ')[0] : null;
  const localToday = todayIn(timezone, now);
  const viewer = await agendaViewer();
  const agenda = viewer.ok
    ? await serverApi<AgendaResponse>(
        `/appointments?from=${localToday}&to=${localToday}&memberId=${viewer.ownMemberId}`,
      )
    : null;
  const agendaNames = agenda?.ok
    ? await patientNamesOf(
        agenda.data.appointments.flatMap((a) => (a.patientId ? [a.patientId] : [])),
      )
    : {};
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
      {agenda?.ok ? (
        <TodayAgenda
          appointments={agenda.data.appointments}
          timezone={timezone}
          patientNames={agendaNames}
        />
      ) : null}
      {overview.ok ? (
        <PatientAlerts
          overview={overview.data}
          names={names}
          filter={filter}
          patientLabel={label}
          pluralPatientLabel={pluralLabel(label)}
          timezone={timezone}
        />
      ) : (
        <Notice tone="danger" title="No pudimos cargar las alertas">
          Vuelve a intentarlo en unos minutos.
        </Notice>
      )}
    </div>
  );
}
