import { OVERVIEW_ALERTS, type OverviewAlert, type OverviewResponse } from '@nutricoach/contracts';
import { EmptyState, StatusBadge } from '@nutricoach/ui';
import { BellOff } from 'lucide-react';
import Link from 'next/link';
import { Section } from '@/features/patients/section';
import { ALERT_LABELS, ALERT_TONES, alertHref, overviewFacts } from './overview-view';

/**
 * Las alertas de los pacientes en Inicio (RF-34, ADR-093): primero los de más alertas; cada una lleva a la pantalla donde se
 * atiende. El filtro va en la URL (?alerta=) para que se pueda compartir y volver.
 */
export function PatientAlerts({
  overview,
  names,
  filter,
  patientLabel,
  pluralPatientLabel,
}: {
  overview: OverviewResponse;
  names: ReadonlyMap<string, string>;
  filter: OverviewAlert | null;
  patientLabel: string;
  pluralPatientLabel: string;
}) {
  const plural = pluralPatientLabel.toLowerCase();
  const shown = OVERVIEW_ALERTS.filter((code) => overview.counts[code] > 0);
  const title = `Alertas de tus ${plural}`;
  if (overview.total === 0 && filter === null) {
    return (
      <EmptyState
        icon={BellOff}
        title={`Ningún ${patientLabel.toLowerCase()} con alertas`}
        description="Aquí aparecen los días sin registros, la adherencia baja, las notas sin leer y los semáforos en rojo o ámbar. Se revisan cada hora."
      />
    );
  }
  return (
    <Section
      title={title}
      description={`${String(overview.total)} ${overview.total === 1 ? patientLabel.toLowerCase() : plural}${
        filter ? ` con «${ALERT_LABELS[filter]}»` : ' con alguna alerta'
      }. Se revisan cada hora y con cada registro.`}
    >
      <nav aria-label="Filtrar por alerta">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/panel"
              aria-current={filter === null ? 'page' : undefined}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm aria-[current=page]:border-foreground aria-[current=page]:font-semibold"
            >
              Todas
            </Link>
          </li>
          {shown.map((code) => (
            <li key={code}>
              <Link
                href={`/panel?alerta=${code}`}
                aria-current={filter === code ? 'page' : undefined}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm aria-[current=page]:border-foreground aria-[current=page]:font-semibold"
              >
                {ALERT_LABELS[code]}
                <span className="tabular-nums text-muted-foreground">
                  {String(overview.counts[code])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ul className="flex flex-col gap-3" aria-label={title}>
        {overview.patients.map((patient) => {
          const name = names.get(patient.patientId) ?? patientLabel;
          return (
            <li
              key={patient.patientId}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <Link
                  href={`/panel/pacientes/${patient.patientId}`}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {name}
                </Link>
                <ul className="flex flex-col text-sm text-muted-foreground">
                  {overviewFacts(patient).map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
              <ul className="flex flex-wrap gap-2 sm:justify-end" aria-label={`Alertas de ${name}`}>
                {patient.alerts.map((code) => (
                  <li key={code}>
                    <Link
                      href={alertHref(patient.patientId, code)}
                      className="inline-flex min-h-11 items-center rounded-md focus-visible:outline-2"
                    >
                      <StatusBadge tone={ALERT_TONES[code]}>{ALERT_LABELS[code]}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {overview.total > overview.patients.length ? (
        <p className="text-sm text-muted-foreground">
          Se muestran {String(overview.patients.length)} de {String(overview.total)}. Filtra por
          alerta para ver el resto.
        </p>
      ) : null}
    </Section>
  );
}
