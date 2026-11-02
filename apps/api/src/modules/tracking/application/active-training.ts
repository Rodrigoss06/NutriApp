import type { ProgramSnapshot } from '../../training/index.js';
import { programDayOn, type ProgramDay, type SnapshotProgram } from '../domain/training-day.js';
import type { ActiveSnapshot } from './ports/records.ports.js';

export interface TrainingDay {
  readonly program: SnapshotProgram;
  readonly day: ProgramDay;
}

/** El programa vigente ese día (07 §8): desde su primer día hasta su última semana. Fuera de ellas no hay programa. */
export function trainingDayOf(
  active: ActiveSnapshot | null,
  localDate: string,
): TrainingDay | null {
  if (!active || localDate < active.effectiveFrom) return null;
  // El snapshot lo escribió training (RN-F12): su tipo cumple el de tracking, y el compilador lo comprueba aquí.
  const program: SnapshotProgram = active.snapshot as ProgramSnapshot;
  const day = programDayOn(program, localDate);
  return day && { program, day };
}
