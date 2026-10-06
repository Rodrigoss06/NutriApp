/** Códigos de método de la versión 1.0 (Notion 02 §9). */
export const METHOD_CODES = [
  'CONSOLIDATE_ISAK',
  'TEM_ISAK',
  'MDC95',
  'BMI',
  'WAIST_HEIGHT',
  'WAIST_HIP',
  'CORRECTED_GIRTH',
  'FAT_DW1974_SIRI1961',
  'FAT_JP1978_7',
  'FAT_FAULKNER1968',
  'FAT_YUHASZ1974',
  'COMP4_DEROSE_GUIMARAES',
  'BONE_ROCHA1975',
  'RESIDUAL_WURCH1974',
  'MUSCLE_LEE2000',
  'COMP5_KERR1988',
  'CORMIC_INDEX',
  'MANOUVRIER_INDEX',
  'ACROMIOILIAC_INDEX',
  'TARGET_WEIGHT_FAT_PCT',
  'FAT_LOSS_7700',
  'RMR_MIFFLIN1990',
  'RMR_HB1919',
  'BMR_SCHOFIELD1985',
  'RMR_CUNNINGHAM1980',
  'RMR_KATCH_MCARDLE',
  'EE_MET_COMPENDIUM2024',
  'MACROS_PROTEIN_FIRST',
  'EXCHANGES_CLASSIC',
  'MEAL_SPLIT_LARGEST_REMAINDER',
  'RECIPE_NUTRIENTS',
  'ADEQUACY',
  'TONNAGE',
  'ONERM_EPLEY1985',
  'ONERM_BRZYCKI1993',
  'RPE_FROM_RIR',
  'FRACTIONAL_SETS',
  'SFR',
  'COMPLIANCE',
] as const;

export type MethodCode = (typeof METHOD_CODES)[number];

/** Familias de 02 §9. */
export type MethodKind =
  | 'DATA_QUALITY'
  | 'INDICATOR'
  | 'BODY_COMPOSITION'
  | 'PROPORTIONALITY'
  | 'GOAL'
  | 'ENERGY'
  | 'DIET'
  | 'TRAINING';

/** Poblaciones de clinical.patient (05.1). */
export type Population = 'ADULT' | 'OLDER_ADULT' | 'ATHLETE' | 'CHILD' | 'ADOLESCENT' | 'OBESITY';

export type Sex = 'M' | 'F';

/** ERROR: no se calcula. WARNING: se calcula y el aviso viaja con el número. INFO: solo se informa (RN-D06). */
export type Severity = 'ERROR' | 'WARNING' | 'INFO';

/** Aviso o error con la regla de negocio que lo origina, como lo devuelve la API en `rule` (06 §5). */
export interface Issue {
  readonly rule: `RN-${string}`;
  readonly severity: Severity;
  readonly code: `NC-ENG-${string}`;
  readonly message: string;
}

/** Entrada de la tabla «Validez por método» de 03 (RN-D06). Sin `when`, aplica siempre. */
export interface ValidityRule<TInput> {
  /** Regla que cita el aviso; RN-D06 si no se indica. */
  readonly rule?: `RN-${string}`;
  readonly severity: Severity;
  readonly code: `NC-ENG-${string}`;
  readonly message: string;
  readonly when?: (input: TInput) => boolean;
}

/** Medida sujeta a los rangos fisiológicos de RN-C04. */
export interface MeasurementCheck {
  readonly field: string;
  readonly kind: 'WEIGHT_KG' | 'HEIGHT_CM' | 'SKINFOLD_MM';
  readonly value: number;
}

export interface Computation<TOutput> {
  readonly outputs: TOutput;
  readonly issues?: readonly Issue[];
}

/** Método registrado (02 §9): estrategia con metadatos, validez y cálculo puro. */
export interface MethodDefinition<TInput, TOutput> {
  readonly code: MethodCode;
  readonly version: string;
  readonly kind: MethodKind;
  readonly population: 'ALL' | readonly Population[];
  readonly requiredInputs: readonly (keyof TInput & string)[];
  readonly requiredSites: readonly string[];
  readonly citation: string;
  readonly validity: readonly ValidityRule<TInput>[];
  readonly measurements?: (input: TInput) => readonly MeasurementCheck[];
  readonly compute: (input: TInput) => Computation<TOutput>;
}

/** Sobre de resultado idéntico para todo método (02 §9, RN-D01). */
export interface CalculationResult<TInput, TOutput> {
  readonly methodCode: MethodCode;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly inputs: TInput;
  readonly inputsHash: string;
  readonly outputs: TOutput;
  readonly warnings: readonly Issue[];
}

export type MethodRun<TInput, TOutput> =
  | { readonly ok: true; readonly result: CalculationResult<TInput, TOutput> }
  | { readonly ok: false; readonly errors: readonly Issue[]; readonly warnings: readonly Issue[] };
