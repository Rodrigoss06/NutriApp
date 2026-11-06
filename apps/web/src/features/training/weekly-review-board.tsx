import {
  methodLabel,
  WEEKLY_ACTION_TEXTS,
  WEEKLY_REASON_TEXTS,
  type CareTeamMember,
  type MemberResponse,
  type TrainingWeek,
  type WeeklyReview,
} from '@nutricoach/contracts';
import { formatNumber, MethodBadge, Notice, StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { weekLabel } from '@/features/analytics/diet-view';
import { StatTable } from '@/features/analytics/stat-table';
import { Section } from '@/features/patients/section';
import { formatInstant } from '@/lib/dates';
import { COACH_DECISION_LABELS, WEEKLY_LIGHT_LABELS, WEEKLY_LIGHT_TONES } from './labels';
import { WeeklyDecisionForm } from './weekly-decision-form';
import {
  formatFactor,
  nextWeekPlan,
  sessionSummary,
  type MacrocycleRow,
  type WeekState,
} from './weekly-review-view';

type Aggregates = NonNullable<WeeklyReview['aggregates']>;

const hours = (value: number | null) =>
  value === null ? '—' : `${formatNumber(value, 'index')} h`;
const pct = (value: number | null) =>
  value === null ? '—' : `${formatNumber(value, 'percent')} %`;
const load = (value: number | null) => formatNumber(value, 'trainingLoad');

const STATE_TEXTS: Readonly<Record<WeekState, string>> = {
  CLOSED: 'Sin calcular',
  CURRENT: 'En curso',
  UPCOMING: 'Por empezar',
};

function LightBadge({ review }: { review: WeeklyReview }) {
  return (
    <StatusBadge tone={WEEKLY_LIGHT_TONES[review.light]}>
      {WEEKLY_LIGHT_LABELS[review.light]}
    </StatusBadge>
  );
}

function decisionText(review: WeeklyReview): string {
  if (!review.decision) return 'Sin decidir';
  const { decision, volumeFactor } = review.decision;
  return volumeFactor === null
    ? COACH_DECISION_LABELS[decision]
    : `${COACH_DECISION_LABELS[decision]} · ${formatFactor(volumeFactor)}`;
}

/**
 * 07 §10, resumen del macrociclo: por semana, la carga, el sueño, el rendimiento, la alimentación, el factor del plan y el
 * factor ajustado, con el semáforo y la decisión; la fase se ve en la semana elegida. Cada semana controlada se abre con su
 * enlace.
 */
function MacrocycleTable({
  rows,
  selected,
  hrefOf,
}: {
  rows: readonly MacrocycleRow[];
  selected: number | null;
  hrefOf: (weekNo: number) => string;
}) {
  const aggregate = (row: MacrocycleRow, pick: (aggregates: Aggregates) => number | null) =>
    row.review?.aggregates ? pick(row.review.aggregates) : null;
  return (
    <StatTable
      label="Semanas del macrociclo"
      caption="Cada semana del macrociclo con su semáforo, sus promedios, el factor del plan, el ajustado y la decisión del coach"
      rows={rows}
      rowKey={(row) => String(row.weekNo)}
      rowClassName={(row) =>
        row.weekNo === selected
          ? 'bg-surface'
          : row.state === 'UPCOMING'
            ? 'text-muted-foreground'
            : undefined
      }
      columns={[
        {
          key: 'week',
          header: 'Semana',
          cell: (row) => {
            const text = `S${String(row.weekNo)} · ${weekLabel(row.weekStart, row.weekEnd)}`;
            return row.review ? (
              <Link
                href={hrefOf(row.weekNo)}
                scroll={false}
                aria-current={row.weekNo === selected ? 'page' : undefined}
                className="text-brand-text underline"
              >
                {text}
              </Link>
            ) : (
              text
            );
          },
        },
        {
          key: 'light',
          header: 'Semáforo',
          cell: (row) =>
            row.review ? (
              <LightBadge review={row.review} />
            ) : (
              <span className="text-muted-foreground">{STATE_TEXTS[row.state]}</span>
            ),
        },
        {
          key: 'srpe',
          header: 'Carga sRPE',
          numeric: true,
          cell: (row) => load(aggregate(row, (a) => a.srpeLoad)),
        },
        {
          key: 'sleep',
          header: 'Sueño',
          numeric: true,
          cell: (row) => hours(aggregate(row, (a) => a.avgSleepHours)),
        },
        {
          key: 'performance',
          header: 'Rendimiento',
          numeric: true,
          cell: (row) => pct(aggregate(row, (a) => a.avgPerformancePct)),
        },
        {
          key: 'nutrition',
          header: 'Alimentación',
          numeric: true,
          cell: (row) => pct(aggregate(row, (a) => a.avgNutritionCompliancePct)),
        },
        {
          key: 'planned',
          header: 'Factor del plan',
          numeric: true,
          cell: (row) => formatFactor(row.plannedFactor),
        },
        {
          key: 'adjusted',
          header: 'Factor ajustado',
          numeric: true,
          cell: (row) => formatFactor(row.review?.suggestedVolumeFactor),
        },
        {
          key: 'decision',
          header: 'Decisión',
          cell: (row) => (row.review ? decisionText(row.review) : '—'),
        },
        {
          key: 'sessions',
          header: 'Sesiones',
          numeric: true,
          cell: (row) =>
            row.sessionsDone === null
              ? `${String(row.sessionsPlanned)} programadas`
              : `${String(row.sessionsDone)} de ${String(row.sessionsPlanned)}`,
        },
      ]}
    />
  );
}

function SessionsSummary({ rows }: { rows: readonly MacrocycleRow[] }) {
  const { registered, programmedToDate, upcoming } = sessionSummary(rows);
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-sm text-muted-foreground">Sesiones registradas</dt>
          <dd className="text-2xl font-semibold">
            {registered}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              de {programmedToDate} programadas hasta hoy
            </span>
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-sm text-muted-foreground">Sesiones próximas</dt>
          <dd className="text-2xl font-semibold">{upcoming}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Las sesiones las registra el paciente en su app y se comparan con las del programa vigente.
      </p>
    </div>
  );
}

function AggregateList({ aggregates }: { aggregates: Aggregates }) {
  const items: readonly (readonly [string, string, number | null])[] = [
    ['Días con sesión', String(aggregates.sessions), aggregates.sessions],
    ['Carga sRPE', `${load(aggregates.srpeLoad)} min × RPE`, aggregates.srpeLoad],
    ['Sueño promedio', hours(aggregates.avgSleepHours), aggregates.avgSleepHours],
    ['Rendimiento promedio', pct(aggregates.avgPerformancePct), aggregates.avgPerformancePct],
    [
      'Alimentación promedio',
      pct(aggregates.avgNutritionCompliancePct),
      aggregates.avgNutritionCompliancePct,
    ],
    [
      'Fatiga promedio',
      `${formatNumber(aggregates.avgFatigue, 'index')} de 5`,
      aggregates.avgFatigue,
    ],
    [
      'Dolor muscular promedio',
      `${formatNumber(aggregates.avgSoreness, 'index')} de 5`,
      aggregates.avgSoreness,
    ],
    [
      'FC en reposo promedio',
      `${formatNumber(aggregates.avgRestingHrBpm, 'kcal')} lpm`,
      aggregates.avgRestingHrBpm,
    ],
    ['HRV promedio', `${formatNumber(aggregates.avgHrvMs, 'kcal')} ms`, aggregates.avgHrvMs],
    [
      'Síntomas del ciclo promedio',
      `${formatNumber(aggregates.avgMenstrualSymptoms, 'index')} de 3`,
      aggregates.avgMenstrualSymptoms,
    ],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {items
        .filter(([, , value]) => value !== null)
        .map(([name, text]) => (
          <div
            key={name}
            className="flex items-baseline justify-between gap-3 border-b border-border py-1"
          >
            <dt className="text-sm text-muted-foreground">{name}</dt>
            <dd className="font-medium tabular-nums">{text}</dd>
          </div>
        ))}
    </dl>
  );
}

function ResultingProgram({
  review,
  patientId,
  weekNo,
}: {
  review: WeeklyReview;
  patientId: string;
  weekNo: number;
}) {
  const decision = review.decision;
  if (!decision) return null;
  if (decision.decision === 'KEEP') {
    return (
      <Notice tone="success" title="Se mantiene el plan">
        La semana {weekNo + 1} queda como estaba.
      </Notice>
    );
  }
  const program = review.resultingProgram;
  if (!program) {
    return (
      <Notice tone="info" title="Sin semana siguiente que cambiar">
        La semana {weekNo} era la última del programa.
      </Notice>
    );
  }
  const href = `/panel/pacientes/${patientId}/entrenamiento/programas/${program.programId}`;
  if (program.status === 'DRAFT') {
    return (
      <Notice tone="warning" title="Falta publicar la versión nueva" rule="RN-F12">
        La semana {weekNo + 1} cambia para el paciente cuando publiques la versión nueva del
        programa.{' '}
        <Link href={href} className="font-medium text-brand-text underline">
          Revisar y publicar la versión nueva
        </Link>
      </Notice>
    );
  }
  if (program.status === 'PUBLISHED') {
    return (
      <Notice tone="success" title="Versión nueva publicada">
        La semana {weekNo + 1} ya usa el factor {formatFactor(decision.volumeFactor)}.{' '}
        <Link href={href} className="font-medium text-brand-text underline">
          Ver el programa
        </Link>
      </Notice>
    );
  }
  return (
    <Notice tone="info" title="La versión que creó esta decisión ya fue reemplazada">
      <Link href={href} className="font-medium text-brand-text underline">
        Ver esa versión
      </Link>
    </Notice>
  );
}

function DecisionView({
  review,
  members,
  timezone,
}: {
  review: WeeklyReview;
  members: readonly MemberResponse[];
  timezone: string;
}) {
  const decision = review.decision;
  if (!decision) return null;
  const author =
    members.find((member) => member.id === decision.decidedBy)?.displayName ?? 'El equipo';
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <p className="font-semibold">
        Decisión: {COACH_DECISION_LABELS[decision.decision]}
        {decision.volumeFactor === null
          ? null
          : ` · factor ${formatFactor(decision.volumeFactor)} para la semana ${String(review.weekNo + 1)}`}
      </p>
      <p className="text-sm whitespace-pre-line">{decision.note}</p>
      <p className="text-sm text-muted-foreground">
        {author} · {formatInstant(decision.decidedAt, timezone)}
      </p>
    </div>
  );
}

/**
 * 07 §10, la semana elegida: su fase, su semáforo con las razones, sus promedios y la decisión sugerida por el método
 * (RN-G16, RN-D01), y la decisión del coach (RN-F17) o el formulario para tomarla.
 */
function ReviewDetail({
  row,
  review,
  weeks,
  patientId,
  careTeam,
  members,
  timezone,
}: {
  row: MacrocycleRow;
  review: WeeklyReview;
  weeks: readonly TrainingWeek[];
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  timezone: string;
}) {
  return (
    <Section
      title={`Semana ${String(review.weekNo)}: ${weekLabel(review.weekStart, review.weekEnd)}`}
      description={row.phase ? `Fase: ${row.phase}.` : undefined}
    >
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <LightBadge review={review} />
          <p className="font-semibold">{WEEKLY_ACTION_TEXTS[review.suggestedAction]}</p>
        </div>
        {review.reasons.length > 0 ? (
          <ul aria-label="Por qué" className="list-disc pl-5 text-sm">
            {review.reasons.map((reason) => (
              <li key={reason}>{WEEKLY_REASON_TEXTS[reason]}</li>
            ))}
          </ul>
        ) : null}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Factor del plan</dt>
            <dd className="font-medium tabular-nums">{formatFactor(review.plannedVolumeFactor)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Factor ajustado</dt>
            <dd className="font-medium tabular-nums">
              {formatFactor(review.suggestedVolumeFactor)}
            </dd>
          </div>
        </dl>
        {review.aggregates ? <AggregateList aggregates={review.aggregates} /> : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <MethodBadge
            label={methodLabel(review.method.code)}
            code={review.method.code}
            version={review.method.version}
          />
          <span className="text-xs text-muted-foreground">
            Calculado el {formatInstant(review.computedAt, timezone)}
          </span>
        </p>
        {review.supersededCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Se recalculó con registros que llegaron tarde: {review.supersededCount}{' '}
            {review.supersededCount === 1
              ? 'control anterior quedó'
              : 'controles anteriores quedaron'}{' '}
            reemplazados, con sus decisiones.
          </p>
        ) : null}
      </div>
      {review.decision ? (
        <>
          <DecisionView review={review} members={members} timezone={timezone} />
          <ResultingProgram review={review} patientId={patientId} weekNo={review.weekNo} />
        </>
      ) : (
        <WeeklyDecisionForm
          key={review.id}
          patientId={patientId}
          reviewId={review.id}
          weekNo={review.weekNo}
          suggestedVolumeFactor={review.suggestedVolumeFactor}
          nextWeek={nextWeekPlan(weeks, review.weekNo)}
          careTeam={careTeam}
          members={members}
        />
      )}
    </Section>
  );
}

/** El control semanal del macrociclo (RF-42, 07 §10): el resumen de todas las semanas y la semana elegida. */
export function WeeklyReviewBoard({
  rows,
  weeks,
  selected,
  patientId,
  careTeam,
  members,
  timezone,
}: {
  rows: readonly MacrocycleRow[];
  weeks: readonly TrainingWeek[];
  selected: number | null;
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  timezone: string;
}) {
  const base = `/panel/pacientes/${patientId}/entrenamiento/control-semanal`;
  const row = rows.find((candidate) => candidate.weekNo === selected);
  const method = rows.findLast((candidate) => candidate.review !== null)?.review?.method;
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Resumen del macrociclo"
        description="Cada semana se controla al cerrar, con los registros diarios del paciente y los umbrales de la organización vigentes ese día."
      >
        <SessionsSummary rows={rows} />
        <MacrocycleTable
          rows={rows}
          selected={selected}
          hrefOf={(weekNo) => `${base}?semana=${String(weekNo)}`}
        />
        {method ? (
          <p className="text-sm text-muted-foreground">
            Semáforo, promedios y factor ajustado:{' '}
            <MethodBadge
              label={methodLabel(method.code)}
              code={method.code}
              version={method.version}
            />
          </p>
        ) : null}
      </Section>
      {row?.review ? (
        <ReviewDetail
          row={row}
          review={row.review}
          weeks={weeks}
          patientId={patientId}
          careTeam={careTeam}
          members={members}
          timezone={timezone}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavía no hay semanas cerradas con su control. La primera se controla cuando termina.
        </p>
      )}
    </div>
  );
}
