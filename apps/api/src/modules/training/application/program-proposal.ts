import {
  macrocycleMesocycles,
  macrocycleWeeks,
  proposalWeek,
  proposeRoutine,
  type RoutineSplit,
  type TrainingLevel,
  type TrainingObjective,
} from '@nutricoach/engine';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import {
  patternTableIncomplete,
  PHASE_TABLE_INCOMPLETE,
  type Mesocycle,
  type ProgramWeek,
} from '../domain/program.js';
import type { StoredPhase } from './ports/program.ports.js';

/**
 * La versión de la tabla que vale para una organización en una fecha (RN-F13): la suya si tiene una, si no la de la V3; de esa,
 * la más reciente. Las filas ya vienen filtradas por fecha.
 */
export function currentPhaseTable(rows: readonly StoredPhase[]): readonly StoredPhase[] {
  const own = rows.filter((row) => row.own);
  const source = own.length > 0 ? own : rows;
  const latest = source.reduce<string | null>(
    (newest, row) => (newest === null || row.validFrom > newest ? row.validFrom : newest),
    null,
  );
  return source.filter((row) => row.validFrom === latest);
}

export interface ProposalInput {
  readonly objective: TrainingObjective;
  readonly level: TrainingLevel;
  readonly daysPerWeek: number;
  readonly macrocycleWeeks: number;
  readonly phases: readonly StoredPhase[];
  readonly choices: readonly {
    readonly pattern: Parameters<typeof proposeRoutine>[1][number]['pattern'];
    readonly level: TrainingLevel;
    readonly exercise: { readonly id: string };
  }[];
  readonly newId: () => string;
}

export interface ProposedProgram {
  readonly split: RoutineSplit;
  readonly templateVersion: string;
  readonly periodizationValidFrom: string;
  readonly mesocycles: readonly Mesocycle[];
}

/**
 * La propuesta como estructura del programa (RN-F13, RN-F14): el motor da la división, los bloques y las semanas, cada semana con
 * su fase, las series según su factor (P-06) y el RIR de su semana (ADR-070). Nada queda aprobado: lo aprueba el coach.
 */
export function proposedProgram(input: ProposalInput): Result<ProposedProgram, DomainError> {
  const { objective, level, daysPerWeek, phases, choices, newId } = input;
  let weeks: readonly StoredPhase[];
  try {
    weeks = macrocycleWeeks(phases, objective, input.macrocycleWeeks) as readonly StoredPhase[];
  } catch (error) {
    if (error instanceof RangeError) return err(PHASE_TABLE_INCOMPLETE);
    throw error;
  }
  const proposal = proposeRoutine({ level, daysPerWeek }, choices);
  const missing = proposal.days.flatMap((day) =>
    day.blocks.filter((block) => block.suggested === null).map((block) => block.pattern),
  );
  if (missing.length > 0) return err(patternTableIncomplete([...new Set(missing)]));

  const weekOf = (phase: StoredPhase): ProgramWeek => ({
    id: newId(),
    weekNo: phase.weekNo,
    isDeload: phase.isDeload,
    phaseEs: phase.phaseEs,
    phaseGoalEs: phase.phaseGoalEs,
    volumeFactor: phase.volumeFactor,
    intensity: phase.intensity,
    targetRir: phase.targetRir,
    reviewKind: phase.reviewKind,
    sessions: proposalWeek(proposal, phase).days.map((day) => ({
      id: newId(),
      position: day.day,
      name: day.name,
      dayOfWeek: null,
      notes: null,
      exercises: day.blocks.map((block) => ({
        id: newId(),
        // Comprobado arriba: ningún bloque queda sin ejercicio.
        exerciseId: block.suggested?.exercise.id ?? '',
        position: block.order,
        supersetGroup: null,
        notes: null,
        movementPattern: block.pattern,
        suggestedExerciseId: block.suggested?.exercise.id ?? null,
        substitutionNote: null,
        approvedBy: null,
        approvedAt: null,
        sets: Array.from({ length: block.sets }, (_, index) => ({
          setNo: index + 1,
          setType: 'WORKING' as const,
          repsMin: block.repsMin,
          repsMax: block.repsMax,
          loadKind: block.loadKind,
          loadValue: block.loadValue,
          restSeconds: block.restSeconds,
          tempo: block.tempo,
          durationSeconds: null,
          distanceM: null,
          met: null,
        })),
      })),
    })),
  });

  return ok({
    split: proposal.split,
    templateVersion: proposal.templateVersion,
    periodizationValidFrom: weeks[0]?.validFrom ?? '',
    mesocycles: macrocycleMesocycles(weeks).map((range, index) => {
      const inRange = weeks.filter(
        (week) => week.weekNo >= range.firstWeek && week.weekNo <= range.lastWeek,
      );
      return {
        id: newId(),
        position: index + 1,
        name: `Mesociclo ${String(index + 1)}`,
        focus: null,
        weeks: inRange.map(weekOf),
      };
    }),
  });
}
