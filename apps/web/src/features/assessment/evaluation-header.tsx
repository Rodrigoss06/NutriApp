import type { EvaluationResponse, MemberResponse } from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { POPULATION_LABELS } from '@/features/patients/labels';
import { formatInstant } from '@/lib/dates';
import { evaluationTitle, STATUS_LABELS, STATUS_TONES } from './labels';

/** Las condiciones de la evaluación en palabras (RN-C09). */
export function conditionsText(conditions: EvaluationResponse['conditions']): string {
  return [
    conditions.fasting ? 'en ayunas' : 'sin ayuno',
    conditions.intenseActivityLast24h
      ? 'con actividad intensa en las 24 horas previas'
      : 'sin actividad intensa en las 24 horas previas',
    conditions.hydration ? `hidratación: ${conditions.hydration}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Un dato de la cabecera: etiqueta estrecha arriba, valor debajo. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-label text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/**
 * Cabecera de una evaluación: nivel, estado, cuándo y quién midió, la edad y la población al medir y sus condiciones
 * (RN-C09). Una revisión muestra su motivo; una enmendada, la revisión que la reemplaza (RN-C07).
 */
export function EvaluationHeader({
  evaluation,
  members,
  timezone,
  patientId,
}: {
  evaluation: EvaluationResponse;
  members: readonly MemberResponse[];
  timezone: string;
  patientId: string;
}) {
  const base = `/panel/pacientes/${patientId}/evaluaciones`;
  const evaluator =
    members.find((m) => m.id === evaluation.evaluatorMemberId)?.displayName ??
    'Miembro de la organización';
  const age = Math.floor(evaluation.patientSnapshot.ageYears);
  return (
    <header className="flex flex-col gap-3">
      <Link
        href={base}
        className="inline-flex w-fit items-center gap-1 text-sm text-brand-text underline underline-offset-4"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Volver a evaluaciones
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{evaluationTitle(evaluation)}</h2>
        <StatusBadge tone={STATUS_TONES[evaluation.status]}>
          {STATUS_LABELS[evaluation.status]}
        </StatusBadge>
        {evaluation.revision > 1 ? (
          <span className="text-sm text-muted-foreground">Revisión {evaluation.revision}</span>
        ) : null}
      </div>
      <dl className="grid gap-x-8 gap-y-3 rounded-lg border border-border bg-card px-4 py-3 text-sm grid-cols-2 lg:grid-cols-4">
        <Fact label="Fecha">{formatInstant(evaluation.measuredAt, timezone)}</Fact>
        <Fact label="Evaluó">{evaluator}</Fact>
        <Fact label="Edad al medir">
          {age} {age === 1 ? 'año' : 'años'}
        </Fact>
        <Fact label="Población">{POPULATION_LABELS[evaluation.patientSnapshot.population]}</Fact>
        <div className="col-span-2 flex flex-col gap-0.5 lg:col-span-4">
          <dt className="font-label text-xs text-muted-foreground">Condiciones</dt>
          <dd className="first-letter:uppercase">{conditionsText(evaluation.conditions)}</dd>
        </div>
      </dl>
      {evaluation.notes ? (
        <p className="text-sm whitespace-pre-wrap">Notas: {evaluation.notes}</p>
      ) : null}
      {evaluation.amendReason && evaluation.amendsEvaluationId ? (
        <Notice
          tone="info"
          title={`Revisión ${String(evaluation.revision)}: enmienda`}
          rule="RN-C07"
        >
          Motivo: {evaluation.amendReason}{' '}
          <Link href={`${base}/${evaluation.amendsEvaluationId}`} className="underline">
            Ver la evaluación enmendada
          </Link>
        </Notice>
      ) : null}
      {evaluation.status === 'AMENDED' && evaluation.amendedByEvaluationId ? (
        <Notice tone="info" title="Esta evaluación fue enmendada" rule="RN-C07">
          Sus resultados quedan como histórico.{' '}
          <Link href={`${base}/${evaluation.amendedByEvaluationId}`} className="underline">
            Ver la revisión que la reemplaza
          </Link>
        </Notice>
      ) : null}
    </header>
  );
}
