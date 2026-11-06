import { addDays } from './diet-weeks.js';
import { CARDIO_MUSCLE } from './daily-summary.js';

/**
 * El calendario de un programa publicado (RN-F01, RN-F08): cada semana del macrocíclo con sus fechas, su mesociclo, si es de
 * descarga y lo que se programó, desde su snapshot (RN-F12). Puro.
 */

/** Lo que se usa del snapshot, en tipos estructurales (02 §4). */
export interface CalendarSource {
  readonly startDate: string;
  readonly mesocycles: readonly {
    readonly id: string;
    readonly weeks: readonly {
      readonly weekNo: number;
      readonly isDeload: boolean;
      /** La fase de la semana (07 §7), si el programa salió de la tabla de fases. */
      readonly phaseEs?: string | null;
      readonly volumeFactor?: number | null;
      readonly targetRir?: number | null;
      readonly sessions: readonly {
        /** Series efectivas por grupo muscular con conteo fraccional, del motor al publicar (RN-F06). */
        readonly setsByMuscle: Readonly<Record<string, number>>;
        readonly exercises: readonly {
          readonly primaryMuscles: readonly { readonly code: string }[];
          readonly secondaryMuscles: readonly { readonly code: string }[];
          readonly sets: readonly {
            readonly setType: string;
            readonly durationSeconds: number | null;
          }[];
        }[];
      }[];
    }[];
  }[];
}

export interface CalendarWeek {
  readonly weekNo: number;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly mesocycleId: string;
  readonly isDeload: boolean;
  readonly phaseEs: string | null;
  readonly volumeFactor: number | null;
  readonly targetRir: number | null;
  readonly sessionsPlanned: number;
  /** Sin el grupo de cardio, que va en minutos (ADR-071). */
  readonly plannedByMuscle: Readonly<Record<string, number>>;
  readonly cardioMinutesPlanned: number;
}

const isCardio = (
  exercise: CalendarSource['mesocycles'][number]['weeks'][number]['sessions'][number]['exercises'][number],
) =>
  [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some(
    (muscle) => muscle.code === CARDIO_MUSCLE,
  );

/** Las semanas en orden; la semana n empieza el día de inicio más 7 × (n − 1) días. */
export function programCalendar(source: CalendarSource): CalendarWeek[] {
  return source.mesocycles
    .flatMap((mesocycle) =>
      mesocycle.weeks.map((week) => {
        const plannedByMuscle: Record<string, number> = {};
        let cardioSeconds = 0;
        for (const session of week.sessions) {
          for (const [muscle, sets] of Object.entries(session.setsByMuscle)) {
            if (muscle === CARDIO_MUSCLE) continue;
            plannedByMuscle[muscle] = (plannedByMuscle[muscle] ?? 0) + sets;
          }
          for (const exercise of session.exercises) {
            if (!isCardio(exercise)) continue;
            for (const set of exercise.sets) {
              if (set.setType !== 'WARMUP') cardioSeconds += set.durationSeconds ?? 0;
            }
          }
        }
        const weekStart = addDays(source.startDate, 7 * (week.weekNo - 1));
        return {
          weekNo: week.weekNo,
          weekStart,
          weekEnd: addDays(weekStart, 6),
          mesocycleId: mesocycle.id,
          isDeload: week.isDeload,
          phaseEs: week.phaseEs ?? null,
          volumeFactor: week.volumeFactor ?? null,
          targetRir: week.targetRir ?? null,
          sessionsPlanned: week.sessions.length,
          plannedByMuscle,
          cardioMinutesPlanned: cardioSeconds / 60,
        };
      }),
    )
    .sort((a, b) => a.weekNo - b.weekNo);
}
