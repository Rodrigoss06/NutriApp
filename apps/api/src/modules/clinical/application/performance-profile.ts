import {
  PRI_JV,
  runMethod,
  SCORED_QUESTIONS,
  type PerformanceClasses,
  type ProfileDomain,
  type ScoredQuestion,
} from '@nutricoach/engine';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { INVALID_ANAMNESIS } from '../domain/clinical-rules.js';

/** Lo que el motor deja de una anamnesis, con todo lo que RN-D01 pide guardar. */
export interface ComputedProfile {
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly inputs: unknown;
  readonly inputsHash: string;
  readonly domainScores: Readonly<Record<ProfileDomain, number | null>>;
  readonly pri: number | null;
  readonly classes: PerformanceClasses;
}

/**
 * Perfil de rendimiento de una anamnesis (RN-F16). A los insumos van solo las respuestas que puntúan: el texto libre se
 * queda en la historia clínica, sin repetirse.
 */
export function computePerformanceProfile(
  answers: Readonly<Record<string, unknown>>,
): Result<ComputedProfile, DomainError> {
  const scored: Partial<Record<ScoredQuestion, number | string>> = {};
  for (const code of SCORED_QUESTIONS) {
    const answer = answers[code];
    if (typeof answer === 'number' || typeof answer === 'string') scored[code] = answer;
  }
  const run = runMethod(PRI_JV, { answers: scored });
  if (!run.ok) return err(INVALID_ANAMNESIS);
  const { methodCode, methodVersion, engineVersion, inputs, inputsHash, outputs } = run.result;
  return ok({
    methodCode,
    methodVersion,
    engineVersion,
    inputs,
    inputsHash,
    domainScores: outputs.domainScores,
    pri: outputs.pri,
    classes: outputs.classes,
  });
}
