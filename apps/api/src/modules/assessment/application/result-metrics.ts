/** Unidades de los indicadores (assessment.result_metric.unit). */
export type MetricUnit = 'kg' | '%' | 'mm' | 'cm' | 'g/mL' | 'kg/m2' | 'm2' | 'ratio' | 'index';

export interface MetricValue {
  readonly metricCode: string;
  readonly value: number;
  readonly unit: MetricUnit;
  /** El método de este número (RN-D02); en 4 componentes, el de cada masa. */
  readonly methodCode: string;
  readonly zScore: number | null;
  /** false: sale de los insumos (la masa grasa de 4 componentes) y no va a result_metric, que ya la tiene. */
  readonly stored: boolean;
}

type Outputs = Readonly<Record<string, unknown>>;

const number = (outputs: Outputs, key: string): number => {
  const value = outputs[key];
  if (typeof value !== 'number') throw new Error(`Salida ${key} sin número.`);
  return value;
};

/**
 * Indicadores de un resultado (formato largo, 05 §1), con el método de cada uno. En 4 componentes la masa ósea es de
 * Rocha, la residual de Würch, la muscular por diferencia y la grasa del método de 2 componentes que entró como
 * insumo: «Masa ósea 12.02 kg (Rocha 1975)».
 */
export function metricsOf(
  methodCode: string,
  outputs: Outputs,
  inputs: Readonly<Record<string, unknown>>,
): MetricValue[] {
  const metric = (
    metricCode: string,
    key: string,
    unit: MetricUnit,
    options: { method?: string; z?: string } = {},
  ): MetricValue => ({
    metricCode,
    value: number(outputs, key),
    unit,
    methodCode: options.method ?? methodCode,
    zScore: options.z ? number(outputs, options.z) : null,
    stored: true,
  });
  const twoComponent = (sumKey: string, withDensity: boolean) => [
    metric('SKINFOLD_SUM_MM', sumKey, 'mm'),
    ...(withDensity ? [metric('BODY_DENSITY', 'density', 'g/mL')] : []),
    metric('FAT_PCT', 'fatPct', '%'),
    metric('FAT_MASS_KG', 'fatMassKg', 'kg'),
    metric('FAT_FREE_MASS_KG', 'fatFreeMassKg', 'kg'),
  ];
  switch (methodCode) {
    case 'BMI':
      return [metric('BMI', 'bmi', 'kg/m2')];
    case 'WAIST_HEIGHT':
      return [metric('WAIST_HEIGHT_RATIO', 'ratio', 'ratio')];
    case 'WAIST_HIP':
      return [metric('WAIST_HIP_RATIO', 'ratio', 'ratio')];
    case 'FAT_DW1974_SIRI1961':
      return twoComponent('sum4Mm', true);
    case 'FAT_JP1978_7':
      return twoComponent('sum7Mm', true);
    case 'FAT_FAULKNER1968':
      return twoComponent('sum4Mm', false);
    case 'FAT_YUHASZ1974':
      return twoComponent('sum6Mm', false);
    case 'COMP4_DEROSE_GUIMARAES':
      return [
        {
          metricCode: 'FAT_MASS_KG',
          value: number(outputs, 'fatMassKg'),
          unit: 'kg',
          methodCode: String(inputs.fatMethodCode),
          zScore: null,
          stored: false,
        },
        metric('BONE_MASS_KG', 'boneKg', 'kg', { method: 'BONE_ROCHA1975' }),
        metric('RESIDUAL_MASS_KG', 'residualKg', 'kg', { method: 'RESIDUAL_WURCH1974' }),
        metric('MUSCLE_MASS_KG', 'muscleKg', 'kg'),
      ];
    case 'MUSCLE_LEE2000':
      return [
        metric('SKELETAL_MUSCLE_MASS_KG', 'skeletalMuscleKg', 'kg'),
        metric('CORRECTED_ARM_GIRTH_CM', 'correctedArmGirthCm', 'cm'),
        metric('CORRECTED_THIGH_GIRTH_CM', 'correctedThighGirthCm', 'cm'),
        metric('CORRECTED_CALF_GIRTH_CM', 'correctedCalfGirthCm', 'cm'),
      ];
    case 'COMP5_KERR1988':
      return [
        metric('BODY_SURFACE_AREA_M2', 'bodySurfaceAreaM2', 'm2'),
        metric('SKIN_MASS_KG', 'skinKg', 'kg'),
        metric('ADIPOSE_MASS_KG', 'adiposeKg', 'kg', { z: 'zAdipose' }),
        metric('MUSCLE_MASS_KG', 'muscleKg', 'kg', { z: 'zMuscle' }),
        metric('BONE_MASS_KG', 'boneKg', 'kg', { z: 'zBone' }),
        metric('HEAD_BONE_MASS_KG', 'headBoneKg', 'kg'),
        metric('BODY_BONE_MASS_KG', 'bodyBoneKg', 'kg'),
        metric('RESIDUAL_MASS_KG', 'residualKg', 'kg', { z: 'zResidual' }),
        metric('STRUCTURED_MASS_KG', 'structuredMassKg', 'kg'),
        metric('STRUCTURED_MASS_DIFF_PCT', 'structuredDiffPct', '%'),
      ];
    case 'CORMIC_INDEX':
    case 'MANOUVRIER_INDEX':
    case 'ACROMIOILIAC_INDEX':
      return [metric(methodCode, 'index', 'index')];
    default:
      throw new Error(`${methodCode} no tiene indicadores en assessment.`);
  }
}
