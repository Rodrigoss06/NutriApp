import type { MethodCode, Population, PopulationDefaults } from '@nutricoach/engine';
import type { EvaluationLevel } from './assessment-rules.js';

/** Para qué sirve un método preferido (assessment.method_preference, RN-D05). */
export type MethodPurpose = 'FAT_PCT' | 'MUSCLE' | 'BONE' | 'RMR' | 'ONE_RM';

/** Métodos que se pueden elegir para cada propósito; los mismos de @nutricoach/contracts. */
export const METHODS_BY_PURPOSE: Readonly<Record<MethodPurpose, readonly MethodCode[]>> = {
  FAT_PCT: ['FAT_DW1974_SIRI1961', 'FAT_JP1978_7', 'FAT_FAULKNER1968', 'FAT_YUHASZ1974'],
  MUSCLE: ['MUSCLE_LEE2000', 'COMP4_DEROSE_GUIMARAES', 'COMP5_KERR1988'],
  BONE: ['BONE_ROCHA1975', 'COMP5_KERR1988'],
  RMR: [
    'RMR_MIFFLIN1990',
    'RMR_HB1919',
    'BMR_SCHOFIELD1985',
    'RMR_CUNNINGHAM1980',
    'RMR_KATCH_MCARDLE',
  ],
  ONE_RM: ['ONERM_EPLEY1985', 'ONERM_BRZYCKI1993'],
};

export const isMethodFor = (purpose: MethodPurpose, methodCode: string): boolean =>
  (METHODS_BY_PURPOSE[purpose] as readonly string[]).includes(methodCode);

const INDICATORS: readonly MethodCode[] = ['BMI', 'WAIST_HEIGHT', 'WAIST_HIP'];
const TWO_COMPONENT: readonly MethodCode[] = METHODS_BY_PURPOSE.FAT_PCT;
const PROPORTIONALITY: readonly MethodCode[] = [
  'CORMIC_INDEX',
  'MANOUVRIER_INDEX',
  'ACROMIOILIAC_INDEX',
];

/**
 * Métodos que ofrece cada nivel (RN-C01): 2 y 4 componentes con el perfil restringido; 5 componentes y
 * proporcionalidad solo con el completo. Rocha y Würch van dentro de 4 componentes (ADR-044). Una evaluación de
 * bioimpedancia, sin nivel, ofrece el IMC si se midieron peso y talla.
 */
export const METHODS_BY_LEVEL: Readonly<Record<EvaluationLevel | 'NONE', readonly MethodCode[]>> = {
  NONE: ['BMI'],
  BASIC: INDICATORS,
  ISAK1: [...INDICATORS, ...TWO_COMPONENT, 'COMP4_DEROSE_GUIMARAES', 'MUSCLE_LEE2000'],
  ISAK2: [
    ...INDICATORS,
    ...TWO_COMPONENT,
    'COMP4_DEROSE_GUIMARAES',
    'MUSCLE_LEE2000',
    'COMP5_KERR1988',
    ...PROPORTIONALITY,
  ],
};

/** Los métodos de composición que calcula assessment, en el orden en que dependen unos de otros. */
export const CALCULATED_METHODS: readonly MethodCode[] = METHODS_BY_LEVEL.ISAK2;

export interface EffectivePreference {
  readonly methodCode: MethodCode | null;
  readonly source: 'PLATFORM' | 'ORGANIZATION' | 'PATIENT';
}

export type EffectivePreferences = Readonly<Record<MethodPurpose, EffectivePreference>>;

/** Una fila de assessment.method_preference ya leída. */
export interface PreferenceRow {
  readonly organizationLevel: boolean;
  readonly population: Population | null;
  readonly purpose: MethodPurpose;
  readonly methodCode: string;
}

/** Lo que vale para un paciente: su elección, si no la de su organización para su población, si no la plataforma. */
export function effectivePreferences(
  population: Population,
  platform: PopulationDefaults,
  rows: readonly PreferenceRow[],
): EffectivePreferences {
  const platformOf = (purpose: MethodPurpose): MethodCode | null => {
    if (purpose === 'FAT_PCT') return platform.fatPct;
    if (purpose === 'MUSCLE') return platform.muscle[0] ?? null;
    if (purpose === 'BONE') return platform.bone;
    return null;
  };
  const pick = (purpose: MethodPurpose): EffectivePreference => {
    const valid = rows.filter(
      (row) => row.purpose === purpose && isMethodFor(purpose, row.methodCode),
    );
    const patient = valid.find((row) => !row.organizationLevel);
    if (patient) return { methodCode: patient.methodCode as MethodCode, source: 'PATIENT' };
    const organization = valid.find(
      (row) => row.organizationLevel && row.population === population,
    );
    if (organization)
      return { methodCode: organization.methodCode as MethodCode, source: 'ORGANIZATION' };
    return { methodCode: platformOf(purpose), source: 'PLATFORM' };
  };
  return {
    FAT_PCT: pick('FAT_PCT'),
    MUSCLE: pick('MUSCLE'),
    BONE: pick('BONE'),
    RMR: pick('RMR'),
    ONE_RM: pick('ONE_RM'),
  };
}

export type ExclusionReason = 'LEVEL' | 'POPULATION';

export interface MethodPlan {
  /** Los que se intentan calcular, en orden: los de 2 componentes antes que 4 componentes, que usa su masa grasa. */
  readonly candidates: readonly MethodCode[];
  readonly excluded: readonly {
    readonly methodCode: MethodCode;
    readonly reason: ExclusionReason;
  }[];
}

const MUSCLE_METHODS = METHODS_BY_PURPOSE.MUSCLE;

/**
 * Qué se calcula (RN-C01, RN-D05): los métodos del nivel y, según la población, todos los de pliegues o solo el
 * elegido. Niños, adolescentes y obesidad no tienen ecuación de pliegues ni de masas por defecto: se calcula solo la
 * que eligió la organización o el profesional. Los sitios y la validez (RN-D04, RN-D06) los decide el motor después.
 */
export function planMethods(
  level: EvaluationLevel | null,
  platform: PopulationDefaults,
  preferences: EffectivePreferences,
): MethodPlan {
  const offered = new Set(METHODS_BY_LEVEL[level ?? 'NONE']);
  const candidates: MethodCode[] = [];
  const excluded: { methodCode: MethodCode; reason: ExclusionReason }[] = [];
  for (const methodCode of CALCULATED_METHODS) {
    if (!offered.has(methodCode)) {
      excluded.push({ methodCode, reason: 'LEVEL' });
      continue;
    }
    const isFat = isMethodFor('FAT_PCT', methodCode);
    const isMuscle = MUSCLE_METHODS.includes(methodCode);
    const withoutFatDefault = platform.fatPct === null;
    const withoutMuscleDefault = platform.muscle.length === 0;
    const chosen = (purpose: MethodPurpose) =>
      preferences[purpose].source !== 'PLATFORM' && preferences[purpose].methodCode === methodCode;
    if (isFat && withoutFatDefault && !chosen('FAT_PCT')) {
      excluded.push({ methodCode, reason: 'POPULATION' });
      continue;
    }
    if (isMuscle && withoutMuscleDefault && !chosen('MUSCLE') && !chosen('BONE')) {
      excluded.push({ methodCode, reason: 'POPULATION' });
      continue;
    }
    candidates.push(methodCode);
  }
  return { candidates, excluded };
}

/**
 * Para qué propósitos es principal cada resultado calculado (RN-D05): el preferido si se calculó; en músculo, si no,
 * el primero de la plataforma que se calculó. La masa ósea de Rocha sale de 4 componentes.
 */
export function principalPurposes(
  computed: readonly MethodCode[],
  platform: PopulationDefaults,
  preferences: EffectivePreferences,
): ReadonlyMap<MethodCode, readonly MethodPurpose[]> {
  const has = (code: MethodCode | null): code is MethodCode =>
    code !== null && computed.includes(code);
  const fat = has(preferences.FAT_PCT.methodCode) ? preferences.FAT_PCT.methodCode : null;
  const muscle = has(preferences.MUSCLE.methodCode)
    ? preferences.MUSCLE.methodCode
    : (platform.muscle.find((code) => computed.includes(code)) ?? null);
  const boneMethod =
    preferences.BONE.methodCode === 'BONE_ROCHA1975'
      ? 'COMP4_DEROSE_GUIMARAES'
      : preferences.BONE.methodCode;
  const bone = has(boneMethod) ? (boneMethod as MethodCode) : null;
  const purposes = new Map<MethodCode, MethodPurpose[]>();
  const mark = (code: MethodCode | null, purpose: MethodPurpose) => {
    if (code) purposes.set(code, [...(purposes.get(code) ?? []), purpose]);
  };
  mark(fat, 'FAT_PCT');
  mark(muscle, 'MUSCLE');
  mark(bone, 'BONE');
  return purposes;
}
