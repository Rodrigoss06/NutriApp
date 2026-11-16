import { formatNumber, type OverviewPatient } from '@nutricoach/contracts';
import { formatDate, formatInstant } from '@/lib/dates';

/** Un dato del Resumen con la sección donde se ve entero (ADR-138). */
export interface SummaryFact {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** De dónde sale o cómo se calculó. */
  readonly detail?: string;
  /** La ruta de la sección, después de /panel/pacientes/:id. */
  readonly section: string;
  readonly link: string;
}

const percent = (value: number) => `${formatNumber(value, 'percent')} %`;

/**
 * Lo último del paciente, de su fila del panel (`analytics.patient_overview`, ADR-093): sin calcular nada en la web y con el
 * redondeo solo al mostrar (RN-D09). Cada dato lleva a la sección donde se ve entero.
 */
export function summaryFacts(row: OverviewPatient, timezone: string): SummaryFact[] {
  return [
    {
      key: 'last-log',
      label: 'Último registro',
      value: row.lastLogDate ? formatDate(row.lastLogDate) : 'Todavía no registra en su app',
      section: '/seguimiento',
      link: 'Ver su día a día',
    },
    {
      key: 'notes',
      label: 'Notas sin leer',
      value: String(row.unreadNotes),
      section: '/seguimiento',
      link: row.unreadNotes > 0 ? 'Leer sus notas' : 'Ver su día a día',
    },
    {
      key: 'adherence',
      label: 'Adherencia de 7 días',
      value: row.adherence7dPct === null ? 'Sin días con meta' : percent(row.adherence7dPct),
      detail: `Días en rango ÷ días con meta, hasta ayer (RN-G09).${
        row.adherence30dPct === null ? '' : ` En 30 días: ${percent(row.adherence30dPct)}.`
      }`,
      section: '/analitica',
      link: 'Ver la analítica de dieta',
    },
    {
      key: 'appointment',
      label: 'Próxima cita',
      value: row.nextAppointmentAt
        ? formatInstant(row.nextAppointmentAt, timezone)
        : 'Sin citas programadas',
      section: '/citas',
      link: 'Ver sus citas',
    },
    {
      key: 'evaluation',
      label: 'Última evaluación cerrada',
      value: row.lastEvaluationAt
        ? formatInstant(row.lastEvaluationAt, timezone)
        : 'Todavía no tiene',
      section: '/evaluaciones',
      link: 'Ver sus evaluaciones',
    },
    {
      key: 'weight',
      label: 'Último peso',
      value:
        row.lastWeightKg === null
          ? 'Sin peso en 30 días'
          : `${formatNumber(row.lastWeightKg, 'mass')} kg`,
      detail: 'Del registro diario de los últimos 30 días, con el ajuste del profesional (RN-G02).',
      section: '/evaluaciones/evolucion',
      link: 'Ver su evolución',
    },
  ];
}

/** Un paciente que recién empieza: sin registros en su app ni evaluaciones cerradas. */
export function justStarted(row: OverviewPatient | null): boolean {
  return row === null || (row.lastLogDate === null && row.lastEvaluationAt === null);
}
