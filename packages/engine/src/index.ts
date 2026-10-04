export {
  canonicalJson,
  inputsHash,
  sha256Hex,
  type JsonObject,
  type JsonValue,
} from './hash/index.js';
export { defineMethod, runMethod } from './registry/run-method.js';
export {
  METHOD_CODES,
  type CalculationResult,
  type Computation,
  type Issue,
  type MeasurementCheck,
  type MethodCode,
  type MethodDefinition,
  type MethodKind,
  type MethodRun,
  type Population,
  type Severity,
  type Sex,
  type ValidityRule,
} from './registry/types.js';
export {
  cm,
  cmToM,
  kcal,
  kg,
  m,
  mm,
  mmToCm,
  type Cm,
  type Kcal,
  type Kg,
  type M,
  type Mm,
} from './units.js';
export { ENGINE_VERSION } from './version.js';
