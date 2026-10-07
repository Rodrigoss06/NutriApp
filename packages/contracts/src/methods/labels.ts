/**
 * Nombre legible de cada método del motor (RN-D02, RN-H04): lo muestran el panel, la app del paciente y las
 * fichas PDF junto a cada número. La clave es el código del registro de @nutricoach/engine (02 §9).
 */
export const METHOD_LABELS = {
  CONSOLIDATE_ISAK: 'Consolidación de tomas (ISAK)',
  TEM_ISAK: 'Error técnico de medida (ETM)',
  MDC95: 'Cambio mínimo detectable (CMD95)',
  BMI: 'IMC',
  WAIST_HEIGHT: 'Índice cintura/talla',
  WAIST_HIP: 'Índice cintura/cadera',
  CORRECTED_GIRTH: 'Perímetro corregido',
  FAT_DW1974_SIRI1961: 'Durnin & Womersley (1974) + Siri',
  FAT_JP1978_7: 'Jackson & Pollock, 7 pliegues',
  FAT_FAULKNER1968: 'Faulkner (1968)',
  FAT_YUHASZ1974: 'Yuhasz (versión de Carter, 6 pliegues)',
  COMP4_DEROSE_GUIMARAES: '4 componentes (De Rose y Guimarães)',
  BONE_ROCHA1975: 'Masa ósea (Rocha)',
  RESIDUAL_WURCH1974: 'Masa residual (Würch)',
  MUSCLE_LEE2000: 'Masa muscular esquelética (Lee, 2000)',
  COMP5_KERR1988: '5 componentes (Kerr, 1988)',
  CORMIC_INDEX: 'Índice córmico',
  MANOUVRIER_INDEX: 'Índice de Manouvrier',
  ACROMIOILIAC_INDEX: 'Índice acromio-ilíaco',
  TARGET_WEIGHT_FAT_PCT: 'Peso objetivo según % de grasa',
  FAT_LOSS_7700: 'Proyección (7700 kcal/kg)',
  RMR_MIFFLIN1990: 'Mifflin-St Jeor (1990)',
  RMR_HB1919: 'Harris-Benedict (1919)',
  BMR_SCHOFIELD1985: 'FAO/OMS/UNU (Schofield)',
  RMR_CUNNINGHAM1980: 'Cunningham (1980)',
  RMR_KATCH_MCARDLE: 'Katch-McArdle',
  EE_MET_COMPENDIUM2024: 'METs (Compendio 2024)',
  MACROS_PROTEIN_FIRST: 'Reparto de macronutrientes',
  EXCHANGES_CLASSIC: 'Intercambios (método clásico)',
  MEAL_SPLIT_LARGEST_REMAINDER: 'Reparto por tiempos de comida',
  RECIPE_NUTRIENTS: 'Composición de receta',
  ADEQUACY: '% de adecuación',
  TONNAGE: 'Tonelaje',
  ONERM_EPLEY1985: '1RM estimado (Epley)',
  ONERM_BRZYCKI1993: '1RM estimado (Brzycki)',
  RPE_FROM_RIR: 'RPE a partir de RIR',
  FRACTIONAL_SETS: 'Series fraccionadas',
  SFR: 'Relación estímulo/fatiga',
  COMPLIANCE: '% de cumplimiento',
} as const satisfies Record<string, string>;

export type LabeledMethodCode = keyof typeof METHOD_LABELS;

/** Etiqueta de un método; un código desconocido se muestra tal cual, nunca un número sin método. */
export function methodLabel(code: string): string {
  return (METHOD_LABELS as Record<string, string>)[code] ?? code;
}
