import {
  formatNumber,
  INDICATION_TEXTS,
  METHOD_LABELS,
  READINESS_NOTE,
  type Readiness,
  type ReadinessIndication,
} from '@nutricoach/contracts';
import { cn, MethodBadge } from '@nutricoach/ui';
import {
  CircleCheck,
  CircleHelp,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

/** Color, ícono y texto (nunca solo color, WCAG 1.4.1): cada indicación con su tono de estado. */
const TONES: Readonly<
  Record<ReadinessIndication, { readonly icon: LucideIcon; readonly className: string }>
> = {
  GREEN: { icon: CircleCheck, className: 'border-success/40 bg-success-surface text-success' },
  YELLOW: {
    icon: TriangleAlert,
    className: 'border-warning/40 bg-warning-surface text-warning',
  },
  RED: { icon: OctagonAlert, className: 'border-danger/40 bg-danger-surface text-danger' },
  NO_DATA: { icon: CircleHelp, className: 'border-info/40 bg-info-surface text-info' },
};

const COMPONENT_NAMES: Readonly<Record<Readiness['neutralComponents'][number], string>> = {
  sleep: 'sueño',
  heartRate: 'frecuencia cardíaca en reposo',
  hrv: 'variabilidad de la frecuencia cardíaca',
  subjective: 'respuestas de cómo te sientes',
};

const listOf = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1) ?? ''}`;

/**
 * La indicación del día en Hoy (RN-G15, 07 §9): su etiqueta y su texto, con la recuperación y el método que la calculó
 * (RN-D02). Sin registro diario, la de «sin datos» invita a hacerlo. Es un consejo para el día: el plan solo lo cambia el
 * coach.
 */
export function IndicationCard({
  readiness,
  headingLevel = 2,
  action = 'link',
}: {
  readiness: Readiness | null;
  headingLevel?: 2 | 3;
  /** link: lleva al registro diario; none: ya se está en él. */
  action?: 'link' | 'none';
}) {
  const indication = readiness?.indication ?? 'NO_DATA';
  const { label, text } = INDICATION_TEXTS[indication];
  const tone = TONES[indication];
  const Icon = tone.icon;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby="indicacion-dia"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <Heading id="indicacion-dia" className="text-lg font-semibold">
        Indicación del día
      </Heading>
      <div className={cn('flex gap-3 rounded-lg border p-3', tone.className)}>
        <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{label}</p>
          <p className="text-foreground">{text}</p>
        </div>
      </div>
      {readiness && readiness.readinessScore !== null ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="flex flex-col">
            <dt className="text-muted-foreground">Recuperación</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatNumber(readiness.readinessScore, 'index')}
              <span className="text-sm font-normal text-muted-foreground"> de 100</span>
            </dd>
          </div>
          {readiness.performancePct !== null ? (
            <div className="flex flex-col">
              <dt className="text-muted-foreground">Rendimiento</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatNumber(readiness.performancePct, 'percent')} %
              </dd>
            </div>
          ) : null}
          {readiness.srpeLoad !== null ? (
            <div className="flex flex-col">
              <dt className="text-muted-foreground">Carga de la sesión</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatNumber(readiness.srpeLoad, 'trainingLoad')}
                <span className="text-sm font-normal text-muted-foreground"> min × RPE</span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {readiness && readiness.readinessScore !== null && readiness.neutralComponents.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin dato de {listOf(readiness.neutralComponents.map((code) => COMPONENT_NAMES[code]))}:
          esa parte usa el valor neutral, no cuenta como mal estado.
        </p>
      ) : null}
      {readiness ? (
        <MethodBadge
          label={METHOD_LABELS.READINESS_JV}
          code={readiness.methodCode}
          version={readiness.methodVersion}
        />
      ) : null}
      <p className="text-sm text-muted-foreground">
        Es un consejo para hoy: tu plan solo cambia cuando tu coach lo decide.
        {/* En el registro diario la nota encabeza el formulario: aquí, solo en Hoy. */}
        {action === 'link' ? ` ${READINESS_NOTE}` : null}
      </p>
      {action === 'link' ? (
        <Link
          href="/mi/registro"
          className="flex min-h-touch items-center font-medium text-brand-text underline"
        >
          {readiness ? 'Actualizar mi registro diario' : 'Hacer mi registro diario'}
        </Link>
      ) : null}
    </section>
  );
}
