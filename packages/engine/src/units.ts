/**
 * Magnitudes con la unidad en el tipo. La marca es estructural, igual a la de @nutricoach/shared-kernel,
 * para que ambos tipos sean compatibles sin que el motor dependa del kernel. Sin redondeo (RN-D09).
 */
export type Kg = number & { readonly __unit: 'kg' };
export type Cm = number & { readonly __unit: 'cm' };
export type M = number & { readonly __unit: 'm' };
export type Mm = number & { readonly __unit: 'mm' };
export type Kcal = number & { readonly __unit: 'kcal' };

function finite(value: number, symbol: string): number {
  if (!Number.isFinite(value)) {
    // El mensaje no repite el valor: puede ser un dato de salud.
    throw new RangeError(`Valor no finito para una magnitud en ${symbol}.`);
  }
  return value;
}

export const kg = (value: number): Kg => finite(value, 'kg') as Kg;
export const cm = (value: number): Cm => finite(value, 'cm') as Cm;
export const m = (value: number): M => finite(value, 'm') as M;
export const mm = (value: number): Mm => finite(value, 'mm') as Mm;
export const kcal = (value: number): Kcal => finite(value, 'kcal') as Kcal;

export const cmToM = (value: Cm): M => (value / 100) as M;
export const mmToCm = (value: Mm): Cm => (value / 10) as Cm;
