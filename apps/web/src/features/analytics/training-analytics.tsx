import {
  methodLabel,
  type FatiguePanelWeek,
  type LoadLight,
  type MuscleFatigueWeek,
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
import {
  adjustedText,
  FATIGUE_LIGHT_LABELS,
  FATIGUE_LIGHT_TONES,
  fatigueWeeks,
  loadChangeText,
  mesocycleGroups,
  muscleFatigueInOrder,
  musclesInOrder,
  muscleWeekNo,
  recoveryText,
  signedPctText,
} from './training-view';

const ONE_DECIMAL = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });
/** Series fraccionadas (RN-F06): 1 por músculo principal y 0.5 por secundario, sin ceros de relleno. */
const sets = (value: number | null) => (value === null ? '—' : ONE_DECIMAL.format(value));
const load = (value: number | null) => formatNumber(value, 'trainingLoad');
const pct = (value: number | null) =>
  value === null ? '—' : `${formatNumber(value, 'percent')} %`;
const scale = (value: number | null) => formatNumber(value, 'index');
const ratio = (value: number | null) => formatNumber(value, 'zScore');
const coefficient = (value: number | undefined) => formatNumber(value, 'fatigueCoefficient');

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

function FatigueLight({ light, detail }: { light: LoadLight; detail?: string | null }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge tone={FATIGUE_LIGHT_TONES[light]}>{FATIGUE_LIGHT_LABELS[light]}</StatusBadge>
      {detail ? <span className="text-xs text-muted-foreground tabular-nums">{detail}</span> : null}
    </span>
  );
}

/**
 * El panel de fatiga y recuperación de la hoja piloto (P14.5, PR 3; P-23 y P-24; ADR-108), semana a semana. Los promedios llegan
 * sin redondear y se redondean aquí (RN-D09). Solo informa: decide el control semanal (P-25).
 */
function FatiguePanelTable({
  weeks,
}: {
  weeks: readonly (TrainingWeek & { readonly fatigue: FatiguePanelWeek })[];
}) {
  const caption = 'Panel de fatiga y recuperación por semana';
  return (
    <StatTable
      label={caption}
      caption={caption}
      rows={weeks}
      rowKey={(week) => String(week.weekNo)}
      columns={[
        {
          key: 'week',
          header: 'Semana',
          cell: (week) => `S${String(week.weekNo)} · ${weekLabel(week.weekStart, week.weekEnd)}`,
        },
        {
          key: 'stress',
          header: 'Estrés',
          numeric: true,
          cell: (week) => scale(week.fatigue.avgStress),
        },
        {
          key: 'sleep',
          header: 'Sueño',
          numeric: true,
          cell: (week) =>
            week.fatigue.avgSleepHours === null ? '—' : `${scale(week.fatigue.avgSleepHours)} h`,
        },
        {
          key: 'fatigue',
          header: 'Fatiga percibida',
          numeric: true,
          cell: (week) => scale(week.fatigue.avgFatigue),
        },
        {
          key: 'adjusted',
          header: 'Volumen ajustado',
          numeric: true,
          cell: (week) => adjustedText(week.fatigue.adjustedVolumeKg, week.unfactoredSets),
        },
        {
          key: 'base',
          header: 'Prom. 3 sem.',
          numeric: true,
          cell: (week) =>
            week.fatigue.baseVolumeKg === null ? '—' : `${load(week.fatigue.baseVolumeKg)} kg`,
        },
        {
          key: 'load',
          header: 'Carga',
          cell: (week) => (
            <FatigueLight light={week.fatigue.load} detail={loadChangeText(week.fatigue)} />
          ),
        },
        {
          key: 'recovery',
          header: 'Recuperación',
          cell: (week) => <FatigueLight light={week.fatigue.recovery} />,
        },
        {
          key: 'perceived',
          header: 'Fatiga',
          cell: (week) => <FatigueLight light={week.fatigue.perceivedFatigue} />,
        },
        {
          key: 'overall',
          header: 'Estado general',
          cell: (week) => <FatigueLight light={week.fatigue.overall} />,
        },
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
 * La fatiga por grupo muscular de la semana elegida (P14.5, PR 4; P-27; ADR-115): el volumen ajustado del grupo contra su promedio de
 * las 3 semanas previas, con su estado y la recuperación estimada, y los cuatro coeficientes de la hoja (P-27.1; ADR-121). Solo
 * informa: decide el control semanal (P-25).
 */
function MuscleFatigueTable({
  fatigue,
  names,
  weekNo,
}: {
  fatigue: MuscleFatigueWeek | null;
  names: ReadonlyMap<string, string>;
  weekNo: number;
}) {
  if (!fatigue) {
    return (
      <p className="text-sm text-muted-foreground">
        La fatiga por grupo muscular aparece cuando la semana {weekNo} empieza.
      </p>
    );
  }
  if (fatigue.muscles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        La semana {weekNo} no tiene volumen ajustado, ni las 3 semanas anteriores.
      </p>
    );
  }
  const caption = `Fatiga por grupo muscular de la semana ${String(weekNo)}`;
  return (
    <StatTable
      label={caption}
      caption={caption}
      rows={muscleFatigueInOrder(fatigue.muscles, names)}
      rowKey={(muscle) => muscle.muscleCode}
      columns={[
        { key: 'name', header: 'Grupo', cell: (muscle) => muscle.name },
        {
          key: 'fatigue',
          header: 'Fatiga entrenamiento',
          numeric: true,
          cell: (muscle) =>
            muscle.trainingFatigueKg === null ? '—' : `${load(muscle.trainingFatigueKg)} kg`,
        },
        {
          key: 'base',
          header: 'Base 3 sem.',
          numeric: true,
          cell: (muscle) =>
            muscle.baseVolumeKg === null ? '—' : `${load(muscle.baseVolumeKg)} kg`,
        },
        {
          key: 'state',
          header: 'Estado',
          cell: (muscle) => (
            <FatigueLight light={muscle.state} detail={signedPctText(muscle.changePct)} />
          ),
        },
        {
          key: 'recovery',
          header: 'Recuperación est.',
          numeric: true,
          cell: (muscle) => recoveryText(muscle.recoveryHours),
        },
        {
          key: 'muscular',
          header: 'Fatiga muscular',
          numeric: true,
          cell: (muscle) => coefficient(muscle.coefficients?.muscularFatigue),
        },
        {
          key: 'neural',
          header: 'Fatiga neural',
          numeric: true,
          cell: (muscle) => coefficient(muscle.coefficients?.neuralFatigue),
        },
        {
          key: 'axial',
          header: 'Carga axial',
          numeric: true,
          cell: (muscle) => coefficient(muscle.coefficients?.axialLoad),
        },
        {
          key: 'technical',
          header: 'Demanda técnica',
          numeric: true,
          cell: (muscle) => coefficient(muscle.coefficients?.technicalDemand),
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
            methods.fatiguePanel,
            methods.muscleFatigue,
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
      {fatigueWeeks(analytics.weeks).length > 0 ? (
        <Section
          title="Panel de fatiga y recuperación"
          description="La recuperación sale del estrés y el sueño promedio de la semana; la carga compara su volumen ajustado con el promedio de las 3 semanas previas que tienen volumen; el estado general es el peor de los tres. Solo informa: decide el control semanal."
        >
          <FatiguePanelTable weeks={fatigueWeeks(analytics.weeks)} />
        </Section>
      ) : null}
      {weekNo !== null && muscleWeek ? (
        <Section
          title="Series por grupo muscular"
          description="Cada serie cuenta 1 para el músculo principal del ejercicio y 0.5 para el secundario; el cardio no entra. El RPE sin registrar sale de 10 − RIR."
        >
          <WeekChips weeks={analytics.weeks} current={weekNo} hrefOf={query} />
          <MusclesTable muscles={muscleWeek.muscles} names={muscleNames} weekNo={weekNo} />
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Fatiga por grupo muscular</h3>
            <p className="text-sm text-muted-foreground">
              La fatiga de entrenamiento es el volumen ajustado del grupo. Se compara con su
              promedio en las 3 semanas previas que tienen volumen, donde una semana sin ese grupo
              cuenta 0. La recuperación estimada depende del estado. Solo informa: decide el control
              semanal.
            </p>
            <p className="text-sm text-muted-foreground">
              Los coeficientes son los de la familia de cada ejercicio, por su patrón y su equipo:
              pierna y cadera, torso libre, guiados y poleas, aislamiento y brazos, y movilidad y
              cardio. En cada grupo se promedian según el volumen que le dio cada familia. Son
              referencia: no cambian el estado ni la recuperación.
            </p>
            <MuscleFatigueTable
              fatigue={muscleWeek.muscleFatigue}
              names={muscleNames}
              weekNo={weekNo}
            />
          </div>
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
