import {
  MEDICAL_CLEARANCE_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  SCREENING_DECISION_LABELS,
  SCREENING_STATUS_LABELS,
  type TrainingSafetyResponse,
} from '@nutricoach/contracts';
import { Notice, StatusBadge, type Tone } from '@nutricoach/ui';
import Link from 'next/link';
import { formatInstant } from '@/lib/dates';
import { PRESCRIPTION_STATUS_MESSAGES, PRESCRIPTION_STATUS_TONES } from './labels';

interface SafetyKey {
  readonly title: string;
  readonly tone: Tone;
  readonly value: string;
  readonly detail?: string | undefined;
  readonly links: readonly { readonly href: string; readonly label: string }[];
}

function keysOf(safety: TrainingSafetyResponse, base: string, timezone: string): SafetyKey[] {
  const { medicalClearance, alarmSymptoms, movement, screening } = safety;
  const screeningLabel = screening ? SCREENING_STATUS_LABELS[screening.status] : '';
  const painTests = `${String(movement.painTests)} ${movement.painTests === 1 ? 'prueba' : 'pruebas'} con dolor`;
  return [
    {
      title: 'Alta médica',
      tone: medicalClearance === null || medicalClearance === 'PENDING' ? 'danger' : 'success',
      value: medicalClearance ? MEDICAL_CLEARANCE_LABELS[medicalClearance] : 'Pendiente',
      detail: medicalClearance ? undefined : 'Sin perfil de entrenamiento, cuenta como pendiente.',
      links: [{ href: `${base}/perfil`, label: 'Ver perfil' }],
    },
    {
      title: 'Dolor y síntomas de alarma',
      tone: alarmSymptoms || movement.painTests > 0 ? 'danger' : 'success',
      value:
        alarmSymptoms || movement.painTests > 0
          ? [alarmSymptoms ? 'Síntomas de alarma' : null, movement.painTests > 0 ? painTests : null]
              .filter(Boolean)
              .join(' · ')
          : 'Sin dolor registrado',
      detail: alarmSymptoms ? 'Los síntomas de alarma se registran en el perfil.' : undefined,
      links: [
        { href: `${base}/postura`, label: 'Ver postura' },
        ...(alarmSymptoms ? [{ href: `${base}/perfil`, label: 'Ver perfil' }] : []),
      ],
    },
    {
      title: 'Cribado previo al ejercicio',
      tone: !screening
        ? 'danger'
        : screening.status === 'GREEN'
          ? 'success'
          : screening.reviewDecision === null || screening.reviewDecision === 'REFER'
            ? 'danger'
            : 'warning',
      value: !screening
        ? 'Sin responder'
        : screening.status === 'GREEN'
          ? screeningLabel
          : screening.reviewDecision
            ? `${screeningLabel} · ${SCREENING_DECISION_LABELS[screening.reviewDecision]}`
            : `${screeningLabel}, sin revisar`,
      detail: screening
        ? `Respondido: ${formatInstant(screening.answeredAt, timezone)}`
        : undefined,
      links: [{ href: `${base}/cribado`, label: 'Ver cribado' }],
    },
  ];
}

/** Las tres llaves y el estado que dan (RF-41, RN-F15, 07 §6). No es un diagnóstico: detiene la propuesta hasta que el coach decide. */
export function SafetySummary({
  safety,
  base,
  timezone,
}: {
  safety: TrainingSafetyResponse;
  base: string;
  timezone: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Notice
        tone={PRESCRIPTION_STATUS_TONES[safety.status]}
        title={PRESCRIPTION_STATUS_LABELS[safety.status]}
        rule="RN-F15"
      >
        {PRESCRIPTION_STATUS_MESSAGES[safety.status]}
      </Notice>
      {safety.movement.evaluated ? null : (
        <Notice tone="warning" title="Sin evaluación postural cerrada">
          No bloquea la propuesta, pero conviene evaluar la postura antes de prescribir.
        </Notice>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {keysOf(safety, base, timezone).map((key) => (
          <li key={key.title} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="font-medium">{key.title}</h3>
              <div>
                <StatusBadge tone={key.tone}>{key.value}</StatusBadge>
              </div>
              {key.detail ? <p className="text-sm text-muted-foreground">{key.detail}</p> : null}
            </div>
            <div className="flex flex-wrap gap-x-4">
              {key.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex min-h-touch items-center text-sm text-brand-text underline underline-offset-4"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
