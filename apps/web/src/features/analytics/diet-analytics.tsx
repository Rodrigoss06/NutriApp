import {
  methodLabel,
  type DietAnalytics,
  type DietDay,
  type DietWeek,
} from '@nutricoach/contracts';
import {
  cn,
  EmptyState,
  formatNumber,
  IndicatorCard,
  MethodBadge,
  StatusBadge,
} from '@nutricoach/ui';
import { Utensils } from 'lucide-react';
import Link from 'next/link';
import { MEAL_SLOT_LABELS } from '@/features/nutrition-plan/labels';
import { Section } from '@/features/patients/section';
import { formatDate } from '@/lib/dates';
import { DietChart } from './diet-chart';
import {
  dietChartPoints,
  hasLogs,
  kcalIsMinimum,
  shortDate,
  slotsInDayOrder,
  summaryWeek,
  weekLabel,
} from './diet-view';
import { RANGE_WEEKS, type RangeWeeks } from './range';
import { StatTable } from './stat-table';

const kcal = (value: number | null) => formatNumber(value, 'kcal');
const grams = (value: number | null) => formatNumber(value, 'grams');
const pct = (value: number | null) =>
  value === null ? '—' : `${formatNumber(value, 'percent')} %`;
/** RN-I03: si a algún registro le falta el dato, lo consumido es un mínimo. */
const minimum = (text: string, isMinimum: boolean) =>
  isMinimum && text !== '—' ? `al menos ${text}` : text;
const slotLabel = (code: string) =>
  (MEAL_SLOT_LABELS as Readonly<Record<string, string>>)[code] ?? code;

/** Los rangos de la analítica, como enlaces: el rango vive en la dirección y se puede compartir. */
export function RangeNav({ base, current }: { base: string; current: RangeWeeks }) {
  return (
    <nav aria-label="Rango de la analítica" className="flex flex-wrap gap-2">
      {RANGE_WEEKS.map((weeks) => (
        <Link
          key={weeks}
          href={`${base}?semanas=${String(weeks)}`}
          aria-current={weeks === current ? 'page' : undefined}
          className={cn(
            'flex min-h-touch items-center rounded-md border px-3 text-sm font-medium',
            weeks === current
              ? 'border-brand bg-surface text-brand-text'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {weeks} semanas
        </Link>
      ))}
    </nav>
  );
}

interface NutrientRow {
  readonly key: string;
  readonly name: string;
  readonly unit: string;
  readonly summary: DietWeek['kcal'];
  readonly format: (value: number | null) => string;
}

/** La semana más reciente con registros: promedio, adecuación y días en rango (RF-32, RN-G09). */
function WeekSummary({ week, analytics }: { week: DietWeek; analytics: DietAnalytics }) {
  const [low, high] = analytics.adequacyRangePct;
  const method = (
    <MethodBadge
      label={methodLabel(analytics.method.code)}
      code={analytics.method.code}
      version={analytics.method.version}
    />
  );
  const nutrients: readonly NutrientRow[] = [
    { key: 'kcal', name: 'Energía', unit: 'kcal', summary: week.kcal, format: kcal },
    { key: 'cho', name: 'Carbohidratos', unit: 'g', summary: week.choG, format: grams },
    { key: 'protein', name: 'Proteína', unit: 'g', summary: week.proteinG, format: grams },
    { key: 'fat', name: 'Grasa', unit: 'g', summary: week.fatG, format: grams },
  ];
  return (
    <Section
      title={`Semana del ${weekLabel(week.weekStart, week.weekEnd)}`}
      description="Promedio de los días con registros y meta, de lunes a domingo. La adecuación es lo consumido sobre la meta."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <IndicatorCard
          label="Energía promedio por día"
          value={kcal(week.kcal.consumed)}
          unit="kcal"
          status={
            week.kcal.complete ? undefined : (
              <StatusBadge tone="info">Al menos: a algunos registros les falta el dato</StatusBadge>
            )
          }
          footer={`Meta promedio: ${kcal(week.kcal.target)} kcal`}
        />
        <IndicatorCard
          label="Adecuación de energía"
          value={formatNumber(week.kcal.adequacyPct, 'percent')}
          unit="%"
          method={method}
          footer={`Rango de la organización: ${String(low)}–${String(high)} %`}
        />
        <IndicatorCard
          label="Días en rango"
          value={String(week.daysInRange)}
          unit={`de ${String(week.daysWithTarget)} con meta`}
          footer={`Días con registros: ${String(week.daysLogged)}`}
        />
      </div>
      <StatTable
        label="Promedio de la semana por nutriente"
        caption={`Consumo promedio, meta y adecuación por nutriente, semana del ${weekLabel(week.weekStart, week.weekEnd)}`}
        rows={nutrients}
        rowKey={(row) => row.key}
        columns={[
          { key: 'name', header: 'Nutriente', cell: (row) => row.name },
          {
            key: 'consumed',
            header: 'Consumo promedio',
            numeric: true,
            cell: (row) =>
              `${minimum(row.format(row.summary.consumed), !row.summary.complete)} ${row.unit}`,
          },
          {
            key: 'target',
            header: 'Meta promedio',
            numeric: true,
            cell: (row) => `${row.format(row.summary.target)} ${row.unit}`,
          },
          {
            key: 'adequacy',
            header: 'Adecuación',
            numeric: true,
            cell: (row) => minimum(pct(row.summary.adequacyPct), !row.summary.complete),
          },
        ]}
      />
    </Section>
  );
}

function WeeksTable({ weeks }: { weeks: readonly DietWeek[] }) {
  const adequacy = (summary: DietWeek['kcal']) =>
    minimum(pct(summary.adequacyPct), !summary.complete);
  return (
    <StatTable
      label="Semanas del rango"
      caption="Promedio, adecuación por nutriente y días en rango de cada semana"
      rows={weeks.filter((week) => week.daysLogged > 0 || week.daysWithTarget > 0).reverse()}
      rowKey={(week) => week.weekStart}
      columns={[
        { key: 'week', header: 'Semana', cell: (week) => weekLabel(week.weekStart, week.weekEnd) },
        {
          key: 'logged',
          header: 'Días con registros',
          numeric: true,
          cell: (week) => String(week.daysLogged),
        },
        {
          key: 'kcal',
          header: 'Energía promedio',
          numeric: true,
          cell: (week) =>
            `${minimum(kcal(week.kcal.consumed), !week.kcal.complete)} / ${kcal(week.kcal.target)} kcal`,
        },
        { key: 'kcalPct', header: 'Energía', numeric: true, cell: (week) => adequacy(week.kcal) },
        { key: 'cho', header: 'Carbohidratos', numeric: true, cell: (week) => adequacy(week.choG) },
        {
          key: 'protein',
          header: 'Proteína',
          numeric: true,
          cell: (week) => adequacy(week.proteinG),
        },
        { key: 'fat', header: 'Grasa', numeric: true, cell: (week) => adequacy(week.fatG) },
        {
          key: 'inRange',
          header: 'Días en rango',
          numeric: true,
          cell: (week) => `${String(week.daysInRange)} de ${String(week.daysWithTarget)}`,
        },
      ]}
    />
  );
}

function MealSlotsTable({ analytics }: { analytics: DietAnalytics }) {
  const slots = slotsInDayOrder(analytics.mealSlots);
  if (slots.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin tiempos de comida en este rango.</p>;
  }
  return (
    <StatTable
      label="Tiempos de comida"
      caption="Días con registro en cada tiempo de comida, sobre los días en que el plan lo tenía"
      rows={slots}
      rowKey={(slot) => slot.slotCode}
      columns={[
        { key: 'slot', header: 'Tiempo de comida', cell: (slot) => slotLabel(slot.slotCode) },
        {
          key: 'planned',
          header: 'Días en el plan',
          numeric: true,
          cell: (slot) => String(slot.plannedDays),
        },
        {
          key: 'logged',
          header: 'Días con registro',
          numeric: true,
          cell: (slot) => String(slot.loggedDays),
        },
        {
          key: 'adherence',
          header: 'Adherencia',
          numeric: true,
          cell: (slot) => pct(slot.adherencePct),
        },
        {
          key: 'offPlan',
          header: 'Días fuera del plan',
          numeric: true,
          cell: (slot) => String(slot.offPlanDays),
        },
      ]}
    />
  );
}

function InRange({ day }: { day: DietDay }) {
  if (day.kcalInRange === null) return <span className="text-muted-foreground">—</span>;
  return day.kcalInRange ? (
    <StatusBadge tone="success">En rango</StatusBadge>
  ) : (
    <StatusBadge tone="warning">Fuera de rango</StatusBadge>
  );
}

function missingText(day: DietDay): string {
  const { items, kcal: noKcal, fiberG } = day.nutrientsMissing;
  if (items === 0) return '—';
  const parts = [
    noKcal > 0 ? `${String(noKcal)} sin energía` : null,
    fiberG > 0 ? `${String(fiberG)} sin fibra` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'Completos' : `${parts.join(', ')} (de ${String(items)})`;
}

function DaysTable({ analytics, patientId }: { analytics: DietAnalytics; patientId: string }) {
  // Los días con solo entrenamiento también tienen resumen: aquí cuentan los de comida, meta o agua.
  const days = analytics.days
    .filter((day) => hasLogs(day) || day.targetKcal !== null || day.waterMl !== null)
    .reverse();
  return (
    <StatTable
      label="Registros de cada día"
      caption="Energía contra la meta, comidas, agua y datos faltantes de cada día con registros o meta"
      rows={days}
      rowKey={(day) => day.localDate}
      columns={[
        {
          key: 'day',
          header: 'Día',
          cell: (day) => (
            <Link
              href={`/panel/pacientes/${patientId}/seguimiento?fecha=${day.localDate}`}
              className="text-brand-text underline"
            >
              <span className="sr-only">Ver los registros del </span>
              {shortDate(day.localDate)}
            </Link>
          ),
        },
        {
          key: 'kcal',
          header: 'Energía',
          numeric: true,
          cell: (day) =>
            hasLogs(day) ? `${minimum(kcal(day.kcal), kcalIsMinimum(day))} kcal` : 'Sin registros',
        },
        {
          key: 'target',
          header: 'Meta',
          numeric: true,
          cell: (day) => `${kcal(day.targetKcal)} kcal`,
        },
        {
          // El perfil de día de la meta (07 §2, P-20): la adecuación del día es contra él.
          key: 'profile',
          header: 'Perfil del día',
          cell: (day) => day.dayProfile?.name ?? '—',
        },
        {
          key: 'adequacy',
          header: 'Adecuación',
          numeric: true,
          cell: (day) => minimum(pct(day.adequacyKcalPct), kcalIsMinimum(day)),
        },
        { key: 'inRange', header: 'Rango', cell: (day) => <InRange day={day} /> },
        {
          key: 'meals',
          header: 'Comidas',
          numeric: true,
          cell: (day) =>
            day.mealsPlanned === null
              ? String(day.mealsLogged)
              : `${String(day.mealsLogged)} de ${String(day.mealsPlanned)}`,
        },
        {
          key: 'offPlan',
          header: 'Fuera del plan',
          numeric: true,
          cell: (day) => String(day.offPlanItems),
        },
        {
          key: 'water',
          header: 'Agua',
          numeric: true,
          cell: (day) =>
            day.waterMl === null
              ? '—'
              : `${formatNumber(day.waterMl, 'grams')}${day.waterTargetMl === null ? '' : ` / ${formatNumber(day.waterTargetMl, 'grams')}`} ml`,
        },
        { key: 'missing', header: 'Registros con datos faltantes', cell: missingText },
      ]}
    />
  );
}

/**
 * RF-32: consumo diario contra la meta, adecuación por macronutriente, promedio semanal, días en rango, tendencia y
 * adherencia por tiempo de comida. Los números salen de la proyección de la API, con los ajustes del profesional ya
 * aplicados (RN-G02); la adecuación lleva su método (RN-D02).
 */
export function DietAnalyticsView({
  analytics,
  patientId,
  weeks,
}: {
  analytics: DietAnalytics;
  patientId: string;
  weeks: RangeWeeks;
}) {
  const base = `/panel/pacientes/${patientId}/analitica`;
  const summary = summaryWeek(analytics.weeks);
  const anyLogs = analytics.days.some(hasLogs);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <RangeNav base={base} current={weeks} />
        <p className="text-sm text-muted-foreground">
          Del {formatDate(analytics.from)} al {formatDate(analytics.to)}, en la fecha local del
          paciente.
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <MethodBadge
            label={methodLabel(analytics.method.code)}
            code={analytics.method.code}
            version={analytics.method.version}
          />
          <span>
            Adecuación: lo consumido sobre la meta. Rango de la organización:{' '}
            {analytics.adequacyRangePct[0]}–{analytics.adequacyRangePct[1]} %.
          </span>
        </p>
      </div>
      {anyLogs ? null : (
        <EmptyState
          icon={Utensils}
          title="Sin registros de comida en este rango"
          description="Cuando el paciente registre lo que come en su app, aquí verás su consumo contra la meta de cada día."
        />
      )}
      {anyLogs && summary ? <WeekSummary week={summary} analytics={analytics} /> : null}
      {anyLogs ? (
        <>
          <Section title="Tendencia" description="La energía de cada día del rango contra su meta.">
            <DietChart points={dietChartPoints(analytics)} />
          </Section>
          <Section
            title="Semanas"
            description="De lunes a domingo. «Al menos» indica que a algún registro le falta el dato."
          >
            <WeeksTable weeks={analytics.weeks} />
          </Section>
          <Section
            title="Adherencia por tiempo de comida"
            description="En cuántos de los días en que el plan tenía ese tiempo hubo un registro, y los días con registros fuera del plan."
          >
            <MealSlotsTable analytics={analytics} />
          </Section>
          <Section
            title="Día por día"
            description="Cada día con registros o meta. Al abrir un día ves sus registros y sus ajustes."
          >
            <DaysTable analytics={analytics} patientId={patientId} />
          </Section>
        </>
      ) : null}
    </div>
  );
}
