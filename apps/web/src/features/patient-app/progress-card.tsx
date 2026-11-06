import {
  methodLabel,
  PATIENT_EVOLUTION_LABELS,
  SIGNIFICANCE_LABELS,
  type NumberKind,
  type PatientEvolutionResponse,
} from '@nutricoach/contracts';
import { formatNumber, MethodBadge, StatusBadge } from '@nutricoach/ui';
import { SIGNIFICANCE_TONES } from '@/features/assessment/labels';
import { formatDate } from '@/lib/dates';

type Item = PatientEvolutionResponse['items'][number];

/** El redondeo de cada número al mostrarlo (RN-D09). */
const KINDS: Readonly<Record<Item['item'], NumberKind>> = {
  WEIGHT: 'mass',
  WAIST: 'length',
  SKINFOLD_SUM6: 'length',
  FAT_PCT: 'percent',
  MUSCLE_MASS: 'mass',
};

/** Las medidas se comparan con el margen de error del evaluador (RN-C06); los números derivados, no (RN-C05). */
const MEASURED: ReadonlySet<Item['item']> = new Set(['WEIGHT', 'WAIST', 'SKINFOLD_SUM6']);

/**
 * Un número de Progreso (RF-30, ADR-091): el último valor con su método (RN-D02), el cambio desde la primera evaluación y, en
 * las medidas, si el cambio es real o «sin cambio significativo» (RN-C06). Sin interpretaciones clínicas.
 */
export function ProgressCard({ item }: { item: Item }) {
  const kind = KINDS[item.item];
  const value = (number: number) => `${formatNumber(number, kind)} ${item.unit}`;
  const first = item.points[0];
  const last = item.points.at(-1);
  const overall = item.overall;
  const significance = MEASURED.has(item.item) ? overall?.significance : null;
  const titleId = `progreso-${item.item.toLowerCase()}`;
  return (
    <li>
      <section
        aria-labelledby={titleId}
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
      >
        <h2 id={titleId} className="text-sm font-medium text-muted-foreground">
          {PATIENT_EVOLUTION_LABELS[item.item]}
        </h2>
        {last ? (
          <p className="text-3xl font-semibold">
            {value(last.value)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              el {formatDate(last.localDate)}
            </span>
          </p>
        ) : null}
        {overall && first ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              {overall.change > 0 ? '+' : overall.change < 0 ? '−' : ''}
              {value(Math.abs(overall.change))} desde el {formatDate(first.localDate)}
            </span>
            {significance && significance !== 'UNKNOWN' ? (
              <StatusBadge tone={SIGNIFICANCE_TONES[significance]}>
                {SIGNIFICANCE_LABELS[significance]}
              </StatusBadge>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Con tu próxima evaluación vas a ver cómo cambió.
          </p>
        )}
        <MethodBadge label={methodLabel(item.methodCode)} code={item.methodCode} />
        {item.points.length > 1 ? (
          <ol
            aria-label={`${PATIENT_EVOLUTION_LABELS[item.item]} en cada evaluación`}
            className="flex flex-col gap-1 border-t border-border pt-2 text-sm"
          >
            {[...item.points].reverse().map((point) => (
              <li key={point.evaluationId} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{formatDate(point.localDate)}</span>
                <span className="tabular-nums">{value(point.value)}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </li>
  );
}
