import {
  METHODS,
  METHODS_BY_POPULATION,
  runMethod,
  type Issue,
  type MethodCode,
} from '@nutricoach/engine';
import type { EvaluationLevel } from '../domain/assessment-rules.js';
import {
  effectivePreferences,
  planMethods,
  principalPurposes,
  type EffectivePreferences,
  type MethodPurpose,
  type PreferenceRow,
} from '../domain/calculation-plan.js';
import { inputsFor, type CalculationSubject } from './calculation-inputs.js';

/** El sobre del motor (RN-D01): método, versión, versión del motor, insumos con su hash, salidas y avisos. */
export interface ComputedResult {
  readonly methodCode: MethodCode;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly inputsHash: string;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly warnings: readonly Issue[];
}

export type UnavailableReason =
  'MISSING_SITES' | 'LEVEL' | 'POPULATION' | 'VALIDITY' | 'DEPENDENCY';

/** Un aviso del motor (NC-ENG) o de assessment (NC-ASM), con su regla. */
export interface CalculationIssue {
  readonly rule: string;
  readonly severity: 'ERROR' | 'WARNING' | 'INFO';
  readonly code: string;
  readonly message: string;
}

export interface UnavailableMethod {
  readonly methodCode: MethodCode;
  readonly reason: UnavailableReason;
  readonly missingSites: readonly string[];
  readonly issues: readonly CalculationIssue[];
}

export interface CalculationInput {
  readonly level: EvaluationLevel | null;
  readonly subject: CalculationSubject;
  /** Consolidados de la evaluación por sitio, sin redondear (RN-C03, RN-D09). */
  readonly values: ReadonlyMap<string, number>;
  readonly preferenceRows: readonly PreferenceRow[];
  readonly referenceGroupCoefficient: number | null;
}

export interface CalculationOutcome {
  readonly results: readonly ComputedResult[];
  readonly unavailable: readonly UnavailableMethod[];
  readonly principal: ReadonlyMap<MethodCode, readonly MethodPurpose[]>;
  readonly preferences: EffectivePreferences;
  readonly populationNote: string | null;
}

const DEPENDENCY_ISSUE: CalculationIssue = {
  rule: 'RN-D05',
  severity: 'ERROR',
  code: 'NC-ASM-017',
  message: '4 componentes usa la masa grasa del método principal de % de grasa, que no se calculó.',
};

/**
 * Calcula una evaluación con el motor (RN-D01, RN-D04 a RN-D07): el plan por nivel y población, los sitios medidos y
 * la validez de cada método. 4 componentes usa la masa grasa del método principal de % de grasa. Sin efectos: quien
 * llama decide qué se guarda.
 */
export function calculateEvaluation(input: CalculationInput): CalculationOutcome {
  const platform = METHODS_BY_POPULATION[input.subject.population];
  const preferences = effectivePreferences(
    input.subject.population,
    platform,
    input.preferenceRows,
  );
  const plan = planMethods(input.level, platform, preferences);
  const results: ComputedResult[] = [];
  const unavailable: UnavailableMethod[] = plan.excluded.map(({ methodCode, reason }) => ({
    methodCode,
    reason,
    missingSites: [],
    issues: [],
  }));
  for (const methodCode of plan.candidates) {
    const method = METHODS[methodCode];
    const missingSites = method.requiredSites.filter((site) => !input.values.has(site));
    if (missingSites.length > 0) {
      unavailable.push({ methodCode, reason: 'MISSING_SITES', missingSites, issues: [] });
      continue;
    }
    let fat: { fatMassKg: number; methodCode: MethodCode } | undefined;
    if (methodCode === 'COMP4_DEROSE_GUIMARAES') {
      const principalFat = results.find((r) => r.methodCode === preferences.FAT_PCT.methodCode);
      const fatMassKg = principalFat?.outputs.fatMassKg;
      if (!principalFat || typeof fatMassKg !== 'number') {
        unavailable.push({
          methodCode,
          reason: 'DEPENDENCY',
          missingSites: [],
          issues: [DEPENDENCY_ISSUE],
        });
        continue;
      }
      fat = { fatMassKg, methodCode: principalFat.methodCode };
    }
    const inputs = inputsFor(methodCode, input.values, input.subject, {
      ...(fat ? { fat } : {}),
      referenceGroupCoefficient: input.referenceGroupCoefficient,
    });
    const run = runMethod(method, inputs as never);
    if (!run.ok) {
      unavailable.push({ methodCode, reason: 'VALIDITY', missingSites: [], issues: run.errors });
      continue;
    }
    results.push({
      methodCode,
      methodVersion: run.result.methodVersion,
      engineVersion: run.result.engineVersion,
      inputs: run.result.inputs,
      inputsHash: run.result.inputsHash,
      outputs: run.result.outputs as Readonly<Record<string, unknown>>,
      warnings: run.result.warnings,
    });
  }
  return {
    results,
    unavailable,
    principal: principalPurposes(
      results.map(({ methodCode }) => methodCode),
      platform,
      preferences,
    ),
    preferences,
    populationNote: platform.note ?? null,
  };
}
