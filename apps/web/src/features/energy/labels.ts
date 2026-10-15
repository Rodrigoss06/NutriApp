import type { EnergyPrescriptionPreview } from '@nutricoach/contracts';

/** Textos de la prescripción energética (interfaz en español, regla 9). */
export const GOAL_LABELS = {
  LOSE_FAT: 'Perder grasa',
  GAIN_MUSCLE: 'Ganar músculo',
  MAINTAIN: 'Mantener',
  RECOMPOSITION: 'Recomposición corporal',
  PERFORMANCE: 'Rendimiento',
} as const satisfies Record<EnergyPrescriptionPreview['goal'], string>;

export const STRATEGY_LABELS = {
  ADDITIVE: 'Aditiva: PAL de la vida diaria más el ejercicio',
  FACTORIAL: 'Factorial: el PAL ya incluye el ejercicio',
} as const satisfies Record<EnergyPrescriptionPreview['strategy'], string>;

/**
 * El ajuste por objetivo en una sola lista (RN-E04): en kg de grasa por mes o en kcal por día, hacia abajo o hacia
 * arriba. La cantidad se escribe en positivo; el signo sale de la opción.
 */
export const ADJUSTMENT_OPTIONS = {
  LOSE_KG: { label: 'Perder grasa: kg por mes', kind: 'FAT_KG_PER_MONTH', sign: -1 },
  GAIN_KG: { label: 'Ganar peso: kg por mes', kind: 'FAT_KG_PER_MONTH', sign: 1 },
  DEFICIT_KCAL: { label: 'Déficit: kcal por día', kind: 'KCAL_PER_DAY', sign: -1 },
  SURPLUS_KCAL: { label: 'Superávit: kcal por día', kind: 'KCAL_PER_DAY', sign: 1 },
  NONE: { label: 'Sin ajuste', kind: 'KCAL_PER_DAY', sign: 0 },
} as const;
export type AdjustmentOption = keyof typeof ADJUSTMENT_OPTIONS;

/** El ajuste que se propone al elegir el objetivo; la persona lo cambia si quiere. */
export const DEFAULT_ADJUSTMENT = {
  LOSE_FAT: 'LOSE_KG',
  GAIN_MUSCLE: 'SURPLUS_KCAL',
  MAINTAIN: 'NONE',
  RECOMPOSITION: 'DEFICIT_KCAL',
  PERFORMANCE: 'NONE',
} as const satisfies Record<EnergyPrescriptionPreview['goal'], AdjustmentOption>;

const decimals = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** PAL, MET y minutos tal como se escribieron: son insumos, no resultados. */
export const formatInput = (value: number): string => decimals.format(value);
