import {
  methodLabel,
  METRIC_LABELS,
  type Interpretation,
  type ReferenceScale,
  type ResultMetric,
} from '@nutricoach/contracts';
import {
  formatNumber,
  MethodBadge,
  ReferenceRuler,
  StatusBadge,
  type NumberKind,
  type RulerBand,
} from '@nutricoach/ui';
import { INTERPRETATION_TONES, METRIC_NUMBER_KINDS, METRIC_UNIT_LABELS } from './labels';

/** Las bandas de la escala que manda la API (RN-D10), en el formato de la regla. */
export function rulerBands(scale: ReferenceScale): RulerBand[] {
  return scale.bands.map((band) => ({
    min: band.minValue,
    max: band.maxValue,
    label: band.label,
    tone: band.tone === 'NEUTRAL' ? 'neutral' : band.tone === 'CAUTION' ? 'caution' : 'risk',
  }));
}

/** Dónde cae el valor sin redondear en su tabla de referencia; sin escala, nada. */
export function MetricRuler({
  value,
  scale,
  kind,
  index,
  className,
}: {
  value: number;
  scale: ReferenceScale | null;
  kind: NumberKind;
  index?: number;
  className?: string;
}) {
  if (!scale) return null;
  return (
    <ReferenceRuler
      value={value}
      bands={rulerBands(scale)}
      formatEdge={(edge) => formatNumber(edge, kind)}
      index={index}
      className={className}
    />
  );
}

/** La interpretación con su fuente (RN-D10), o por qué no la hay (RN-D05). */
export function InterpretationText({
  interpretation,
  note,
}: {
  interpretation: Interpretation | null;
  note: string | null;
}) {
  if (interpretation) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge tone={INTERPRETATION_TONES[interpretation.tone]}>
          {interpretation.label}
        </StatusBadge>
        <span className="text-xs text-muted-foreground">Fuente: {interpretation.source}</span>
      </span>
    );
  }
  return note ? <span className="text-xs text-muted-foreground">{note}</span> : null;
}

/**
 * Un indicador: nombre, valor redondeado solo al mostrar (RN-D09), puntaje Z si lo hay, su método (RN-D02) e
 * interpretación con fuente. En 4 componentes cada masa lleva su propio método: «Masa ósea 12.0 kg (Rocha)».
 */
export function MetricLine({ metric, swatch }: { metric: ResultMetric; swatch?: string }) {
  const unit = METRIC_UNIT_LABELS[metric.unit];
  return (
    <div
      data-metric={metric.metricCode}
      className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
    >
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {swatch ? (
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: swatch }}
          />
        ) : null}
        {METRIC_LABELS[metric.metricCode]}
      </dt>
      <dd className="flex flex-col gap-1 sm:min-w-56 sm:items-end">
        <span className="tabular-nums">
          <span className="font-semibold">
            {formatNumber(metric.value, METRIC_NUMBER_KINDS[metric.metricCode])}
          </span>
          {unit ? ` ${unit}` : ''}
          {metric.zScore === null ? null : (
            <span className="text-muted-foreground">
              {' '}
              · Z {formatNumber(metric.zScore, 'zScore')}
            </span>
          )}
        </span>
        <MethodBadge label={methodLabel(metric.methodCode)} code={metric.methodCode} />
        <InterpretationText
          interpretation={metric.interpretation}
          note={metric.interpretationNote}
        />
        <MetricRuler
          value={metric.value}
          scale={metric.referenceScale}
          kind={METRIC_NUMBER_KINDS[metric.metricCode]}
          className="w-full sm:w-56"
        />
      </dd>
    </div>
  );
}
