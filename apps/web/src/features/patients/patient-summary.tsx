import type { OverviewPatient, PatientResponse } from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import {
  ALERT_ACTIONS,
  ALERT_LABELS,
  ALERT_TONES,
  alertHref,
} from '@/features/analytics/overview-view';
import { formatInstant } from '@/lib/dates';
import { Section } from './section';
import { justStarted, summaryFacts } from './summary-view';

/**
 * El Resumen del expediente (ADR-138): lo que pide atención, cada alerta con el enlace a la sección donde se atiende, y lo
 * último del paciente, de su fila del panel (ADR-093). No calcula nada: los números son los de la API (RN-D09).
 */
export function PatientSummary({
  patient,
  row,
  patientLabel,
  timezone,
}: {
  patient: PatientResponse;
  /** Su fila del panel; null si todavía no tiene (o si está archivado: sale del panel). */
  row: OverviewPatient | null;
  patientLabel: string;
  /** La zona de la organización, para las citas y las evaluaciones (RN-J03). */
  timezone: string;
}) {
  const base = `/panel/pacientes/${patient.id}`;
  const noun = patientLabel.toLowerCase();
  if (patient.status === 'ARCHIVED') {
    return (
      <Notice tone="info" title={`${patientLabel} archivado: sin seguimiento`}>
        Su historial sigue en el expediente.{' '}
        <Link href={`${base}/ficha`} className="font-medium text-brand-text underline">
          Ir a la ficha
        </Link>
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Qué pide atención"
        description="Las alertas del panel, cada una con la sección donde se atiende. Se revisan cada hora y con cada registro."
      >
        {row === null ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay alertas calculadas para este {noun}.
          </p>
        ) : row.alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck aria-hidden className="size-4 text-success" />
            Ninguna alerta: nada pide atención ahora.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Alertas">
            {row.alerts.map((alert) => (
              <li
                key={alert}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <StatusBadge tone={ALERT_TONES[alert]}>{ALERT_LABELS[alert]}</StatusBadge>
                <Link
                  href={alertHref(patient.id, alert)}
                  className="inline-flex min-h-touch items-center text-sm font-medium text-brand-text underline sm:min-h-0"
                >
                  {ALERT_ACTIONS[alert]}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {justStarted(row) ? (
        <Notice tone="info" title="Para empezar">
          <ul className="list-disc pl-5">
            <li>
              Registra su consentimiento de datos de salud en{' '}
              <Link href={`${base}/consentimientos`} className="text-brand-text underline">
                Consentimientos
              </Link>
              .
            </li>
            <li>
              Completa su{' '}
              <Link href={`${base}/historia`} className="text-brand-text underline">
                historia clínica
              </Link>{' '}
              y su primera{' '}
              <Link href={`${base}/evaluaciones`} className="text-brand-text underline">
                evaluación
              </Link>
              .
            </li>
            <li>
              Envíale la invitación a la app desde la{' '}
              <Link href={`${base}/ficha`} className="text-brand-text underline">
                Ficha
              </Link>{' '}
              para que registre su día.
            </li>
          </ul>
        </Notice>
      ) : null}
      {row ? (
        <Section
          title="Lo último"
          description={`Actualizado el ${formatInstant(row.updatedAt, timezone)}`}
        >
          <dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {summaryFacts(row, timezone).map((fact) => (
              <div
                key={fact.key}
                className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4"
              >
                <dt className="text-sm text-muted-foreground">{fact.label}</dt>
                <dd className="flex flex-col gap-1">
                  <span className="text-xl font-semibold tabular-nums">{fact.value}</span>
                  {fact.detail ? (
                    <span className="text-xs text-muted-foreground">{fact.detail}</span>
                  ) : null}
                  <Link
                    href={`${base}${fact.section}`}
                    className="mt-1 inline-flex min-h-touch w-fit items-center text-sm text-brand-text underline sm:min-h-0"
                  >
                    {fact.link}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </div>
  );
}
