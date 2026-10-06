import type { MethodCode, Population } from './types.js';

export interface PopulationDefaults {
  /** Ecuación de % de grasa por defecto; null si no hay ecuación de pliegues para la población. */
  readonly fatPct: MethodCode | null;
  /** Métodos de masa muscular, en orden de preferencia. */
  readonly muscle: readonly MethodCode[];
  readonly bone: MethodCode | null;
  /** Indicadores que se muestran primero. */
  readonly priorityIndicators: readonly MethodCode[];
  /** Aviso para el profesional cuando la población no tiene ecuación de pliegues. */
  readonly note?: string;
}

const WITHOUT_SKINFOLD_EQUATION: PopulationDefaults = {
  fatPct: null,
  muscle: [],
  bone: null,
  priorityIndicators: ['BMI', 'WAIST_HEIGHT'],
  note:
    'En esta población las ecuaciones de pliegues pierden validez: la versión 1.0 prioriza IMC, cintura y cintura/talla. ' +
    'Durnin y Womersley se puede elegir desde los 16 años en mujeres y los 17 en hombres, con la advertencia de Siri.',
};

const ADULT_DEFAULTS: PopulationDefaults = {
  fatPct: 'FAT_DW1974_SIRI1961',
  muscle: ['MUSCLE_LEE2000', 'COMP4_DEROSE_GUIMARAES'],
  bone: 'BONE_ROCHA1975',
  priorityIndicators: [],
};

/**
 * Valores por defecto de la plataforma por población (RN-D05, 03 v1.1). Son datos: la organización los
 * configura y el profesional los cambia por paciente (assessment.method_preference).
 */
export const METHODS_BY_POPULATION: Readonly<Record<Population, PopulationDefaults>> = {
  ADULT: ADULT_DEFAULTS,
  OLDER_ADULT: ADULT_DEFAULTS,
  ATHLETE: {
    fatPct: 'FAT_YUHASZ1974',
    muscle: ['COMP5_KERR1988'],
    bone: 'BONE_ROCHA1975',
    priorityIndicators: [],
  },
  CHILD: WITHOUT_SKINFOLD_EQUATION,
  ADOLESCENT: WITHOUT_SKINFOLD_EQUATION,
  OBESITY: WITHOUT_SKINFOLD_EQUATION,
};

/** Fórmula de 1RM por defecto; siempre la misma para un paciente (RN-F04). */
export const DEFAULT_ONE_RM_METHOD: MethodCode = 'ONERM_EPLEY1985';
