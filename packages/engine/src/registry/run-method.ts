import { inputsHash } from '../hash/index.js';
import { ENGINE_VERSION } from '../version.js';
import type { Issue, MeasurementCheck, MethodDefinition, MethodRun } from './types.js';

/** Rangos fisiológicos de RN-C04. Perímetros, diámetros y longitudes los valida el catálogo de sitios. */
const PHYSIOLOGICAL_RANGES: Record<MeasurementCheck['kind'], readonly [number, number, string]> = {
  SKINFOLD_MM: [0, 80, 'mm'],
  HEIGHT_CM: [100, 230, 'cm'],
  WEIGHT_KG: [20, 300, 'kg'],
};

function physiologicalIssues(checks: readonly MeasurementCheck[]): Issue[] {
  return checks.flatMap(({ field, kind, value }) => {
    const [min, max, unit] = PHYSIOLOGICAL_RANGES[kind];
    if (Number.isFinite(value) && value >= min && value <= max) return [];
    return [
      {
        rule: 'RN-C04',
        severity: 'ERROR',
        code: 'NC-ENG-001',
        message: `${field} fuera del rango fisiológico (${min} a ${max} ${unit}).`,
      } satisfies Issue,
    ];
  });
}

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Declara un método con su tipo de insumos y resultados. */
export const defineMethod = <TInput, TOutput>(
  definition: MethodDefinition<TInput, TOutput>,
): MethodDefinition<TInput, TOutput> => Object.freeze(definition);

/**
 * Ejecuta un método: valida los rangos fisiológicos (RN-C04) y la validez de la ecuación (RN-D06),
 * calcula y devuelve el sobre común con el hash de los insumos (RN-D01).
 */
export function runMethod<TInput, TOutput>(
  method: MethodDefinition<TInput, TOutput>,
  input: TInput,
): MethodRun<TInput, TOutput> {
  const inputs = deepFreeze(structuredCopy(input));
  const physiological = physiologicalIssues(method.measurements?.(inputs) ?? []);
  if (physiological.length > 0) return { ok: false, errors: physiological, warnings: [] };

  const validity: Issue[] = method.validity
    .filter((rule) => rule.severity !== 'INFO' && (rule.when?.(inputs) ?? true))
    .map(({ rule = 'RN-D06', severity, code, message }) => ({ rule, severity, code, message }));
  const validityErrors = validity.filter((issue) => issue.severity === 'ERROR');
  const validityWarnings = validity.filter((issue) => issue.severity === 'WARNING');
  if (validityErrors.length > 0) {
    return { ok: false, errors: validityErrors, warnings: validityWarnings };
  }

  const { outputs, issues = [] } = method.compute(inputs);
  const errors = issues.filter((issue) => issue.severity === 'ERROR');
  const warnings = [...validityWarnings, ...issues.filter((issue) => issue.severity === 'WARNING')];
  if (errors.length > 0) return { ok: false, errors, warnings };

  return {
    ok: true,
    result: deepFreeze({
      methodCode: method.code,
      methodVersion: method.version,
      engineVersion: ENGINE_VERSION,
      inputs,
      inputsHash: inputsHash(inputs),
      outputs,
      warnings,
    }),
  };
}

/** Copia profunda de datos JSON; el hash rechaza después lo que no lo sea. */
function structuredCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => structuredCopy(item)) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, structuredCopy(item as unknown)]),
    ) as T;
  }
  return value;
}
