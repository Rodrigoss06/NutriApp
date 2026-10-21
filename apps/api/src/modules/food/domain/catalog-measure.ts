/**
 * Una medida casera de una fuente global para un alimento de otra: la TAFERA mide alimentos de la TPCA (RN-I01). Los
 * gramos son de parte comestible (RN-E12).
 */
export interface CatalogMeasure {
  /** Código de la medida en su fuente: «1-1». */
  readonly code: string;
  /** Código del alimento en la fuente de alimentos: «A3». */
  readonly foodCode: string;
  readonly name: string;
  /** Peso neto: la parte comestible de la medida. */
  readonly grams: number;
  /** Peso bruto, con cáscara, hueso o envase; null si la fuente no lo da. */
  readonly grossGrams: number | null;
}

/** Un factor de conversión de peso cocido a crudo de una fuente global: peso crudo = peso cocido × factor. */
export interface CatalogCookingFactor {
  /** Código del factor en su fuente: «II-001». */
  readonly code: string;
  /** Código del alimento crudo en la fuente de alimentos. */
  readonly foodCode: string;
  /** El alimento como lo nombra la fuente: «Pollo, ala». */
  readonly name: string;
  readonly method: string;
  readonly cookedToRawFactor: number;
}
