import {
  BMI,
  CONSOLIDATE_ISAK,
  CORRECTED_GIRTH,
  MDC95,
  TEM_ISAK,
  WAIST_HEIGHT,
  WAIST_HIP,
} from '../anthropometry/index.js';
import {
  BONE_ROCHA1975,
  COMP4_DEROSE_GUIMARAES,
  COMP5_KERR1988,
  FAT_DW1974_SIRI1961,
  FAT_FAULKNER1968,
  FAT_JP1978_7,
  FAT_YUHASZ1974,
  MUSCLE_LEE2000,
  RESIDUAL_WURCH1974,
} from '../body-composition/index.js';
import {
  ADEQUACY,
  EXCHANGES_CLASSIC,
  MACROS_PROTEIN_FIRST,
  MEAL_SPLIT_LARGEST_REMAINDER,
  RECIPE_NUTRIENTS,
} from '../diet/index.js';
import {
  BMR_SCHOFIELD1985,
  EE_MET_COMPENDIUM2024,
  FAT_LOSS_7700,
  RMR_CUNNINGHAM1980,
  RMR_HB1919,
  RMR_KATCH_MCARDLE,
  RMR_MIFFLIN1990,
  TARGET_WEIGHT_FAT_PCT,
} from '../energy/index.js';
import { ACROMIOILIAC_INDEX, CORMIC_INDEX, MANOUVRIER_INDEX } from '../proportionality/index.js';
import {
  COMPLIANCE,
  FRACTIONAL_SETS,
  ONERM_BRZYCKI1993,
  ONERM_EPLEY1985,
  RPE_FROM_RIR,
  SFR,
  TONNAGE,
} from '../training/index.js';
import type { MethodCode, MethodDefinition } from './types.js';

/** Cualquier método, sin importar sus tipos de insumos y resultados. */
export type AnyMethod = MethodDefinition<never, unknown>;

/** Registro de los métodos de la versión 1.0 (02 §9). Inmutable: no hay estado global que cambie. */
export const METHODS: Readonly<Record<MethodCode, AnyMethod>> = Object.freeze({
  CONSOLIDATE_ISAK,
  TEM_ISAK,
  MDC95,
  BMI,
  WAIST_HEIGHT,
  WAIST_HIP,
  CORRECTED_GIRTH,
  FAT_DW1974_SIRI1961,
  FAT_JP1978_7,
  FAT_FAULKNER1968,
  FAT_YUHASZ1974,
  COMP4_DEROSE_GUIMARAES,
  BONE_ROCHA1975,
  RESIDUAL_WURCH1974,
  MUSCLE_LEE2000,
  COMP5_KERR1988,
  CORMIC_INDEX,
  MANOUVRIER_INDEX,
  ACROMIOILIAC_INDEX,
  TARGET_WEIGHT_FAT_PCT,
  FAT_LOSS_7700,
  RMR_MIFFLIN1990,
  RMR_HB1919,
  BMR_SCHOFIELD1985,
  RMR_CUNNINGHAM1980,
  RMR_KATCH_MCARDLE,
  EE_MET_COMPENDIUM2024,
  MACROS_PROTEIN_FIRST,
  EXCHANGES_CLASSIC,
  MEAL_SPLIT_LARGEST_REMAINDER,
  RECIPE_NUTRIENTS,
  ADEQUACY,
  TONNAGE,
  ONERM_EPLEY1985,
  ONERM_BRZYCKI1993,
  RPE_FROM_RIR,
  FRACTIONAL_SETS,
  SFR,
  COMPLIANCE,
} satisfies Record<MethodCode, unknown>);

/**
 * Métodos que se pueden ofrecer con lo medido (RN-D04): se midieron todos sus sitios requeridos y el
 * paciente cumple su validez obligatoria (ERROR de RN-D06). `subject` lleva lo que la validez consulta:
 * sexo, edad, población y, para Lee, el coeficiente de grupo de la organización (RN-D11).
 */
export function availableMethods(
  measuredSites: readonly string[],
  subject: Readonly<Record<string, unknown>>,
): MethodCode[] {
  const measured = new Set(measuredSites);
  return (Object.entries(METHODS) as [MethodCode, AnyMethod][])
    .filter(([, method]) => method.requiredSites.length > 0)
    .filter(([, method]) => method.requiredSites.every((site) => measured.has(site)))
    .filter(([, method]) =>
      method.validity.every(
        (rule) => rule.severity !== 'ERROR' || !(rule.when?.(subject as never) ?? true),
      ),
    )
    .map(([code]) => code);
}
