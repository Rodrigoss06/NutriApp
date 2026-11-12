import {
  MESOCYCLE_REPORT_TEXT_LABELS,
  methodLabel,
  type MesocycleReport,
  type MesocycleReportBody,
} from '@nutricoach/contracts';
import { MethodBadge, Notice, StatusBadge } from '@nutricoach/ui';
import { StatTable } from '@/features/analytics/stat-table';
import { PhysicalComparison } from '@/features/assessment/evolution-board';
import { Section } from '@/features/patients/section';
import { formatDate } from '@/lib/dates';
import { WEEKLY_LIGHT_LABELS, WEEKLY_LIGHT_TONES } from './labels';
import {
  averageText,
  kgText,
  percentText,
  reportWeekRows,
  summaryTiles,
  type ReportWeekRow,
} from './mesocycle-report-view';

const dash = <span className="text-muted-foreground">—</span>;

/** Una cifra de la semana: sin empezar, una raya (la semana no tiene registros que contar). */
const ofWeek = (row: ReportWeekRow, value: (week: NonNullable<ReportWeekRow['week']>) => string) =>
  row.week ? value(row.week) : dash;

function Summary({ numbers }: { numbers: NonNullable<MesocycleReportBody['numbers']> }) {
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summaryTiles(numbers).map((tile) => (
          <div
            key={tile.key}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
          >
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{tile.value}</dd>
            {tile.detail ? <dd className="text-xs text-muted-foreground">{tile.detail}</dd> : null}
          </div>
        ))}
      </dl>
      <MethodBadge
        label={methodLabel(numbers.method.code)}
        code={numbers.method.code}
        version={numbers.method.version}
      />
    </div>
  );
}

function Weeks({ body }: { body: MesocycleReportBody }) {
  return (
    <StatTable
      label="Semana a semana"
      caption="Series, sesiones, récords, bienestar y control de cada semana del mesociclo"
      rows={reportWeekRows(body)}
      rowKey={(row) => String(row.weekNo)}
      columns={[
        {
          key: 'week',
          header: 'Semana',
          cell: (row) => (
            <span className="flex flex-col">
              <span>{row.label}</span>
              {row.isDeload ? (
                <span className="text-xs text-muted-foreground">Descarga</span>
              ) : null}
              {row.started ? null : (
                <span className="text-xs text-muted-foreground">Todavía no empieza</span>
              )}
            </span>
          ),
        },
        {
          key: 'sets',
          header: 'Series hechas',
          numeric: true,
          cell: (row) =>
            ofWeek(row, (week) => `${String(week.doneSets)} de ${String(week.plannedSets)}`),
        },
        {
          key: 'volume',
          header: 'Volumen cumplido',
          numeric: true,
          cell: (row) => ofWeek(row, (week) => percentText(week.volumePct)),
        },
        {
          key: 'sessions',
          header: 'Sesiones',
          numeric: true,
          cell: (row) =>
            ofWeek(
              row,
              (week) => `${String(week.sessionsDone)} de ${String(week.sessionsPlanned)}`,
            ),
        },
        {
          key: 'records',
          header: 'Récords',
          numeric: true,
          cell: (row) => ofWeek(row, (week) => String(week.records)),
        },
        {
          key: 'sleep',
          header: 'Sueño',
          numeric: true,
          cell: (row) => ofWeek(row, (week) => averageText(week.sleepHours, 'h')),
        },
        {
          key: 'stress',
          header: 'Estrés',
          numeric: true,
          cell: (row) => ofWeek(row, (week) => averageText(week.stress, '/ 5')),
        },
        {
          key: 'fatigue',
          header: 'Fatiga',
          numeric: true,
          cell: (row) => ofWeek(row, (week) => averageText(week.fatigue, '/ 5')),
        },
        {
          key: 'performance',
          header: 'Rendimiento',
          numeric: true,
          cell: (row) => ofWeek(row, (week) => percentText(week.performancePct)),
        },
        {
          key: 'nutrition',
          header: 'Alimentación',
          numeric: true,
          cell: (row) => ofWeek(row, (week) => percentText(week.nutritionPct)),
        },
        {
          key: 'control',
          header: 'Control semanal',
          cell: (row) =>
            row.review ? (
              <span className="flex flex-col items-start gap-1">
                <StatusBadge tone={WEEKLY_LIGHT_TONES[row.review.light]}>
                  {WEEKLY_LIGHT_LABELS[row.review.light]}
                </StatusBadge>
                <span>{row.action}</span>
              </span>
            ) : (
              dash
            ),
        },
        {
          key: 'decision',
          header: 'Decisión del coach',
          cell: (row) => row.decision ?? dash,
        },
      ]}
    />
  );
}

function Records({ body }: { body: MesocycleReportBody }) {
  const records = body.numbers?.records ?? [];
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin récords en este mesociclo.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label="Récords del mesociclo">
        {records.map((record) => (
          <li
            key={`${record.exerciseId}-${String(record.weekNo)}`}
            className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3"
          >
            <span className="font-medium">{record.exerciseName}</span>
            <span className="text-sm tabular-nums">
              {kgText(record.estimated1rmKg)} de 1RM estimado; antes,{' '}
              {kgText(record.previousBestKg)}
            </span>
            <span className="text-xs text-muted-foreground">
              Semana {record.weekNo} · {formatDate(record.localDate)}
            </span>
          </li>
        ))}
      </ul>
      {body.program.oneRmMethod ? (
        <MethodBadge
          label={methodLabel(body.program.oneRmMethod.code)}
          code={body.program.oneRmMethod.code}
          version={body.program.oneRmMethod.version}
        />
      ) : null}
    </div>
  );
}

/**
 * Lo que muestra el informe del mesociclo (P14.5, PR 7b; P-28 y P-29; RN-G19): el resumen, cada semana con su control, los récords y
 * la comparativa física, como el «Informe mensual» de la hoja de Jeremy. Cada número con su método (RN-D02). Lo usan el panel y la
 * app; el borrador muestra los números de hoy y el enviado, los que se congelaron (RN-D08).
 */
export function MesocycleReportSheet({ body }: { body: MesocycleReport['body'] }) {
  if (!body) {
    return (
      <Notice tone="warning" title="Este mesociclo ya no está en el programa publicado">
        El informe no tiene semanas que mostrar.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Resumen del mesociclo"
        description={`${body.program.name} · del ${formatDate(body.mesocycle.startDate)} al ${formatDate(body.mesocycle.endDate)}`}
      >
        {body.numbers ? (
          <Summary numbers={body.numbers} />
        ) : (
          <p className="text-sm text-muted-foreground">
            El mesociclo todavía no empieza: los números aparecen con su primera semana.
          </p>
        )}
      </Section>
      <Section
        title="Semana a semana"
        description="Lo hecho frente a la rutina completa de cada semana, los promedios del registro diario y el control semanal."
      >
        <Weeks body={body} />
      </Section>
      <Section
        title="Récords"
        description="Cada ejercicio cuenta una vez por semana; la primera vez que se hace no cuenta."
      >
        <Records body={body} />
      </Section>
      <Section
        title="Comparativa física"
        description="De la primera evaluación a la última hasta el cierre del mesociclo."
      >
        {body.evolution ? (
          <PhysicalComparison evolution={body.evolution} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin evaluaciones hasta el cierre del mesociclo.
          </p>
        )}
      </Section>
    </div>
  );
}

/** Los textos del coach, como los rotula la hoja (P-28): los de un informe enviado, que ya no cambian. */
export function ReportTexts({ report }: { report: MesocycleReport }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {(
        Object.keys(MESOCYCLE_REPORT_TEXT_LABELS) as (keyof typeof MESOCYCLE_REPORT_TEXT_LABELS)[]
      ).map((key) => (
        <div key={key} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
          <dt className="text-sm font-medium">{MESOCYCLE_REPORT_TEXT_LABELS[key]}</dt>
          <dd className="whitespace-pre-line text-sm">{report[key] ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
