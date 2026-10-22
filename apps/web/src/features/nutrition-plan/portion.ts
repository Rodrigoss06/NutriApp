import type { ExchangeGroupCode } from '@nutricoach/contracts';

type Macro = 'choG' | 'proteinG' | 'fatG';

/**
 * El macronutriente que define a cada grupo de intercambio (ADR-057): carbohidratos en verduras, frutas y almidones,
 * proteína en lácteos y carnes, y grasa en grasas. nutrient es su código INFOODS en la tabla de alimentos.
 */
export const DEFINING_MACRO: Readonly<
  Record<ExchangeGroupCode, { macro: Macro; nutrient: string; label: string }>
> = {
  VEG: { macro: 'choG', nutrient: 'CHOCDF', label: 'carbohidratos' },
  FRU: { macro: 'choG', nutrient: 'CHOCDF', label: 'carbohidratos' },
  MILK: { macro: 'proteinG', nutrient: 'PROCNT', label: 'proteína' },
  STA: { macro: 'choG', nutrient: 'CHOCDF', label: 'carbohidratos' },
  MEAT: { macro: 'proteinG', nutrient: 'PROCNT', label: 'proteína' },
  FAT: { macro: 'fatG', nutrient: 'FAT', label: 'grasa' },
};

/**
 * Gramos del alimento que aportan lo mismo que un intercambio de su grupo en el macronutriente que lo define (ADR-057):
 * lo que aporta el intercambio ÷ ese macronutriente por 100 g del alimento × 100. Es una ayuda: la porción la escribe
 * el profesional. null si el alimento no tiene el dato o no aporta ese macronutriente (RN-I03).
 */
export function suggestedGrams(
  groupCode: ExchangeGroupCode,
  exchange: Readonly<Record<Macro, number>>,
  nutrientsPer100g: Readonly<Record<string, number | null>>,
): number | null {
  const { macro, nutrient } = DEFINING_MACRO[groupCode];
  const per100g = nutrientsPer100g[nutrient];
  if (per100g === null || per100g === undefined || per100g <= 0) return null;
  return (exchange[macro] / per100g) * 100;
}

/**
 * Ingestas adecuadas de agua total por día en adultos (con el agua de los alimentos), como ayuda para la meta de
 * hidratación (RN-E13, ADR-057). No hay valor por defecto: la meta la escribe el profesional.
 */
const HYDRATION_REFERENCES = [
  { source: 'EFSA 2010', F: 2_000, M: 2_500 },
  { source: 'IOM 2004', F: 2_700, M: 3_700 },
] as const;

export function hydrationReferences(
  sex: 'M' | 'F',
): readonly { readonly source: string; readonly ml: number }[] {
  return HYDRATION_REFERENCES.map((reference) => ({
    source: reference.source,
    ml: reference[sex],
  }));
}
