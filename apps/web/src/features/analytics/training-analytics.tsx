import {
  methodLabel,
  type TrainingAnalytics,
  type TrainingMuscleWeek,
  type TrainingWeek,
} from '@nutricoach/contracts';
import { cn, EmptyState, formatNumber, MethodBadge, StatusBadge } from '@nutricoach/ui';
import { Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { Section } from '@/features/patients/section';
import { formatFactor } from '@/features/training/weekly-review-view';
import { formatDate } from '@/lib/dates';
import { weekLabel } from './diet-view';
import { ProgramPicker } from './program-picker';
import { StatTable } from './stat-table';
import { OneRmChart, TrainingWeekCharts } from './training-charts';
import { adjustedText, mesocycleGroups, musclesInOrder, muscleWeekNo } from './training-view';

const ONE_DECIMAL = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });
/** Series fraccionadas (RN-F06): 1 por músculo principal y 0.5 por secundario, sin ceros de relleno. */
const sets = (value: number | null) => (value === null ? '—' : ONE_DECIMAL.format(value));
const load = (value: number | null) => formatNumber(value, 'trainingLoad');
const pct = (value: number | null) =>
  value === null ? '—' : `${formatNumber(value, 'percent')} %`;
const scale = (value: number | null) => formatNumber(value, 'index');
const ratio = (value: number | null) => formatNumber(value, 'zScore');

function sessionsText(week: TrainingWeek): string {
  if (!week.started || week.sessionsDone === null) {
    return `${String(week.sessionsPlanned)} programadas`;
  }
  return `${String(week.sessionsDone)} de ${String(week.sessionsPlanned)}`;
}

function cardioText(week: TrainingWeek): string {
  if (week.cardioMinutesPlanned === 0 && !week.cardioMinutesDone) return '—';
  return `${load(week.cardioMinutesDone ?? 0)} de ${load(week.cardioMinutesPlanned)} min`;
}

function WeeksTable({ weeks, caption }: { weeks: readonly TrainingWeek[]; caption: string }) {
  return (
    <StatTable
      label={caption}
      caption={caption}
      rows={weeks}
      rowKey={(week) => String(week.weekNo)}
      rowClassName={(week) => (week.started ? undefined : 'text-muted-foreground')}
      columns={[
        {
          key: 'week',
          header: 'Semana',
          cell: (week) => `S${String(week.weekNo)} · ${weekLabel(week.weekStart, week.weekEnd)}`,
        },
        {
          key: 'phase',
          header: 'Fase',
          cell: (week) => (
            <span className="flex items-center gap-2">
              {week.phase ?? '—'}
              {week.isDeload && week.phase !== 'Descarga' ? (
                <StatusBadge tone="info">Descarga</StatusBadge>
              ) : null}
            </span>
          ),
        },
        {
          key: 'factor',
          header: 'Factor',
          numeric: true,
          cell: (week) => formatFactor(week.volumeFactor),
        },
        {
          key: 'rir',
          header: 'RIR',
          numeric: true,
          cell: (week) => (week.targetRir === null ? '—' : String(week.targetRir)),
        },
        { key: 'sessions', header: 'Sesiones', numeric: true, cell: sessionsText },
        {
          key: 'compliance',
          header: 'Cumplimiento',
          numeric: true,
          cell: (week) => pct(week.sessionsCompliancePct),
        },
        {
          key: 'tonnage',
          header: 'Tonelaje',
          numeric: true,
          cell: (week) => (week.tonnageKg === null ? '—' : `${load(week.tonnageKg)} kg`),
        },
        {
          key: 'adjusted',
          header: 'Volumen ajustado',
          numeric: true,
          cell: (week) => adjustedText(week.adjustedVolumeKg, week.unfactoredSets),
        },
        {
          key: 'srpe',
          header: 'Carga sRPE',
          numeric: true,
          cell: (week) => load(week.srpeLoad),
        },
        { key: 'cardio', header: 'Cardio', numeric: true, cell: cardioText },
      ]}
    />
  );
}

function WeekChips({
  weeks,
  current,
  hrefOf,
}: {
  weeks: readonly TrainingWeek[];
  current: number;
  hrefOf: (weekNo: number) => string;
}) {
  return (
    <nav aria-label="Semana de las series por grupo muscular" className="flex flex-wrap gap-2">
      {weeks.map((week) => (
        <Link
          key={week.weekNo}
          href={hrefOf(week.weekNo)}
          scroll={false}
          aria-current={week.weekNo === current ? 'page' : undefined}
          className={cn(
            'flex min-h-touch min-w-touch items-center justify-center rounded-md border px-3 text-sm font-medium tabular-nums',
            week.weekNo === current
              ? 'border-brand bg-surface text-brand-text'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="sr-only">Semana </span>S{week.weekNo}
        </Link>
      ))}
    </nav>
  );
}

function MusclesTable({
  muscles,
  names,
  weekNo,
}: {
  muscles: readonly TrainingMuscleWeek[];
  names: ReadonlyMap<string, string>;
  weekNo: number;
}) {
  if (muscles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        La semana {weekNo} no tiene series programadas ni registradas.
      </p>
    );
  }
  const caption = `Series por grupo muscular de la semana ${String(weekNo)}`;
  return (
    <StatTable
      label={caption}
      caption={caption}
      rows={musclesInOrder(muscles, names)}
      rowKey={(muscle) => muscle.muscleCode}
      columns={[
        { key: 'name', header: 'Grupo', cell: (muscle) => muscle.name },
        {
          key: 'planned',
          header: 'Programadas',
          numeric: true,
          cell: (muscle) => sets(muscle.setsPlanned),
        },
        { key: 'done', header: 'Hechas', numeric: true, cell: (muscle) => sets(muscle.setsDone) },
        {
          key: 'compliance',
          header: 'Cumplimiento',
          numeric: true,
          cell: (muscle) => pct(muscle.compliancePct),
        },
        {
          key: 'tonnage',
          header: 'Tonelaje',
          numeric: true,
          cell: (muscle) => (muscle.tonnageKg === null ? '—' : `${load(muscle.tonnageKg)} kg`),
        },
        {
          key: 'adjusted',
          header: 'Volumen ajustado',
          numeric: true,
          cell: (muscle) => adjustedText(muscle.adjustedVolumeKg, muscle.unfactoredSets),
        },
        { key: 'rpe', header: 'RPE', numeric: true, cell: (muscle) => scale(muscle.avgRpe) },
        {
          key: 'stimulus',
          header: 'Estímulo',
          numeric: true,
          cell: (muscle) => scale(muscle.avgStimulus),
        },
        {
          key: 'fatigue',
          header: 'Fatiga',
          numeric: true,
          cell: (muscle) => scale(muscle.avgFatigue),
        },
        {
          key: 'sfr',
          header: 'Estímulo/fatiga',
          numeric: true,
          cell: (muscle) => ratio(muscle.sfr),
        },
      ]}
    />
  );
}

/**
 * RF-33: tonelaje, series fraccionadas por grupo y semana contra lo programado, 1RM estimado en el tiempo, estímulo y
 * fatiga y cumplimiento, todo agrupado por mesociclo. Lo programado es la última versión publicada del programa
 * (RN-F12); lo hecho, lo que registró el paciente. Cada número con su método (RN-D02).
 */
export function TrainingAnalyticsView({
  analytics,
  patientId,
  muscleNames,
  programs,
  requestedWeek,
}: {
  analytics: TrainingAnalytics;
  patientId: string;
  muscleNames: ReadonlyMap<string, string>;
  programs: readonly { readonly id: string; readonly label: string }[];
  requestedWeek: string | string[] | undefined;
}) {
  const { program } = analytics;
  const base = `/panel/pacientes/${patientId}/analitica/rutina`;
  if (!program) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Sin programa publicado"
        description="Cuando publiques un programa, aquí verás lo programado contra lo que registra el paciente, semana por semana."
        action={
          <Link
            href={`/panel/pacientes/${patientId}/entrenamiento/programas`}
            className="text-sm text-brand-text underline"
          >
            Ir a los programas
          </Link>
        }
      />
    );
  }
  const weekNo = muscleWeekNo(analytics.weeks, requestedWeek);
  const muscleWeek = analytics.weeks.find((week) => week.weekNo === weekNo);
  const query = (week: number) =>
    `${base}?programa=${encodeURIComponent(program.programId)}&semana=${String(week)}`;
  const { methods } = analytics;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        {programs.length > 1 ? (
          <ProgramPicker base={base} current={program.programId} programs={programs} />
        ) : null}
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{program.name}</span> · {program.totalWeeks}{' '}
          semanas, del {formatDate(program.startDate)} al {formatDate(program.endDate)}.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            methods.tonnage,
            methods.adjustedVolume,
            methods.fractionalSets,
            methods.compliance,
            methods.rpe,
            methods.sfr,
            methods.srpe,
          ].map((method) => (
            <MethodBadge
              key={method.code}
              label={methodLabel(method.code)}
              code={method.code}
              version={method.version}
            />
          ))}
        </p>
      </div>
      <Section
        title="Semana a semana"
        description="Lo programado y lo registrado en cada semana del macrociclo. Las semanas que no empezaron solo muestran lo programado."
      >
        <TrainingWeekCharts weeks={analytics.weeks} />
        {mesocycleGroups(analytics).map((group, index) => (
          <div key={group.id} className="flex flex-col gap-2">
            <h3 className="font-semibold">
              Mesociclo {index + 1}: {group.name}
              {group.focus ? (
                <span className="font-normal text-muted-foreground"> · {group.focus}</span>
              ) : null}
            </h3>
            <WeeksTable weeks={group.weeks} caption={`Semanas del mesociclo ${group.name}`} />
          </div>
        ))}
      </Section>
      {weekNo !== null && muscleWeek ? (
        <Section
          title="Series por grupo muscular"
          description="Cada serie cuenta 1 para el músculo principal del ejercicio y 0.5 para el secundario; el cardio no entra. El RPE sin registrar sale de 10 − RIR."
        >
          <WeekChips weeks={analytics.weeks} current={weekNo} hrefOf={query} />
          <MusclesTable muscles={muscleWeek.muscles} names={muscleNames} weekNo={weekNo} />
        </Section>
      ) : null}
      <Section
        title="1RM estimado"
        description="La mejor serie efectiva de cada día, de 1 a 12 repeticiones, con la fórmula del programa."
      >
        <OneRmChart series={analytics.oneRm} />
      </Section>
    </div>
  );
}
