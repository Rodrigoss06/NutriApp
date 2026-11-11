import type { ExerciseBaseMeasure, ExerciseModality } from '../exercise/library.js';
import { LOAD_KIND_LABELS } from './labels.js';
import type { LoadKind } from './program.js';

/**
 * Lo que el texto de una serie necesita de su ejercicio, congelado en el snapshot (RN-F12). Un programa publicado antes de la
 * plantilla 1.1.0 de la ficha de rutina no lo trae: se escribe como antes.
 */
export interface PrescriptionExercise {
  readonly isUnilateral?: boolean;
  readonly modality?: ExerciseModality | null;
  readonly baseMeasure?: ExerciseBaseMeasure | null;
}

export interface PrescriptionSet {
  readonly repsMin: number | null;
  readonly repsMax: number | null;
  readonly loadKind: LoadKind | null;
  readonly loadValue: number | null;
  readonly restSeconds: number | null;
  readonly durationSeconds: number | null;
  readonly distanceM: number | null;
  readonly met: number | null;
}

/** Las partes del texto de una serie; null, la que no tiene. */
export interface PrescriptionParts {
  /** «8 a 12 rep», o «10 a 12 rep/lado» en un unilateral. */
  readonly reps: string | null;
  /** «25 min», o en segundos si el ejercicio se mide en segundos: «30 s», «20 s/lado». */
  readonly duration: string | null;
  readonly distance: string | null;
  /** «60 kg», «RIR 2», o «esfuerzo suave (RPE 5–6)» con RIR 4 o más en movilidad o cardio. */
  readonly load: string | null;
  readonly met: string | null;
  readonly rest: string | null;
}

/** P-34.6: en la movilidad y el cardio, un RIR 4 o 5 solo indica un esfuerzo suave, y no cambia el volumen. */
export const LIGHT_EFFORT_TEXT = 'esfuerzo suave (RPE 5–6)';

const lightEffort = (set: PrescriptionSet, exercise: PrescriptionExercise): boolean =>
  set.loadKind === 'RIR' &&
  set.loadValue !== null &&
  set.loadValue >= 4 &&
  (exercise.modality === 'MOBILITY' || exercise.modality === 'CARDIO');

/**
 * El texto de una serie prescrita, por partes (P-34, respuestas de Jeremy del 2026-11-10; ADR-114): «/lado» en un ejercicio
 * unilateral, los segundos en uno que se mide en segundos (una isometría) y «esfuerzo suave (RPE 5–6)» en la movilidad y el
 * cardio con RIR 4 o más. `number` escribe cada número, como lo pide cada pantalla.
 */
export function prescriptionParts(
  set: PrescriptionSet,
  exercise: PrescriptionExercise = {},
  number: (value: number) => string = String,
): PrescriptionParts {
  const side = exercise.isUnilateral === true ? '/lado' : '';
  const reps =
    set.repsMin !== null && set.repsMax !== null && set.repsMin !== set.repsMax
      ? `${number(set.repsMin)} a ${number(set.repsMax)} rep${side}`
      : set.repsMin !== null || set.repsMax !== null
        ? `${number(set.repsMin ?? set.repsMax ?? 0)} rep${side}`
        : null;
  const duration =
    set.durationSeconds === null
      ? null
      : exercise.baseMeasure === 'SECONDS'
        ? `${number(set.durationSeconds)} s${side}`
        : `${number(set.durationSeconds / 60)} min`;
  const load = lightEffort(set, exercise)
    ? LIGHT_EFFORT_TEXT
    : set.loadKind === null
      ? null
      : set.loadKind === 'BODYWEIGHT'
        ? LOAD_KIND_LABELS.BODYWEIGHT
        : set.loadValue === null
          ? null
          : set.loadKind === 'KG' || set.loadKind === 'PCT_1RM'
            ? `${number(set.loadValue)} ${LOAD_KIND_LABELS[set.loadKind]}`
            : `${set.loadKind} ${number(set.loadValue)}`;
  return {
    reps,
    duration,
    distance: set.distanceM === null ? null : `${number(set.distanceM)} m`,
    load,
    met: set.met === null ? null : `MET ${number(set.met)}`,
    rest: set.restSeconds === null ? null : `${number(set.restSeconds)} s`,
  };
}

/** Lo prescrito en una línea: «8 a 12 rep · RIR 2 · 90 s», «20 s/lado · esfuerzo suave (RPE 5–6) · 45 s». */
export function prescriptionText(
  set: PrescriptionSet,
  exercise: PrescriptionExercise = {},
  number: (value: number) => string = String,
): string {
  const parts = prescriptionParts(set, exercise, number);
  return [parts.reps, parts.duration, parts.distance, parts.load, parts.met, parts.rest]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
