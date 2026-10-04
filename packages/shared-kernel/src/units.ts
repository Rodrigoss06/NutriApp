/**
 * Magnitudes con unidad en el tipo (06 §3 y principio 8 del documento técnico): un pliegue en
 * milímetros no se suma por error a una talla en centímetros. Nunca se redondea aquí: se redondea
 * solo al presentar (RN-D09). La marca es estructural para que el motor declare las mismas.
 */
export type Kg = number & { readonly __unit: 'kg' };
export type Cm = number & { readonly __unit: 'cm' };
export type Mm = number & { readonly __unit: 'mm' };
export type Kcal = number & { readonly __unit: 'kcal' };
export type Ml = number & { readonly __unit: 'ml' };

function finite(value: number, symbol: string): number {
  if (!Number.isFinite(value)) {
    // El mensaje no repite el valor: puede ser un dato de salud.
    throw new RangeError(`Valor no finito para una magnitud en ${symbol}.`);
  }
  return value;
}

export const kg = (value: number): Kg => finite(value, 'kg') as Kg;
export const cm = (value: number): Cm => finite(value, 'cm') as Cm;
export const mm = (value: number): Mm => finite(value, 'mm') as Mm;
export const kcal = (value: number): Kcal => finite(value, 'kcal') as Kcal;
export const ml = (value: number): Ml => finite(value, 'ml') as Ml;
