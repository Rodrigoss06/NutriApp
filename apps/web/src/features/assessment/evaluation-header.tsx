import type { EvaluationResponse, MemberResponse } from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
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
      <Link href={base} className="text-sm text-brand-text underline">
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
      <p className="text-sm text-muted-foreground">
        {formatInstant(evaluation.measuredAt, timezone)} · Evaluó {evaluator} · {age}{' '}
        {age === 1 ? 'año' : 'años'} al medir ·{' '}
        {POPULATION_LABELS[evaluation.patientSnapshot.population]}
      </p>
      <p className="text-sm text-muted-foreground">
        Condiciones: {conditionsText(evaluation.conditions)}
      </p>
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
