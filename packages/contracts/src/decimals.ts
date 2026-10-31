/**
 * Si un número cabe en los decimales que guarda su columna. Más precisión se rechaza en vez de redondearse en silencio al
 * guardar (RN-D09: el redondeo es solo al presentar).
 */
export const upToDecimals =
  (digits: number) =>
  (value: number): boolean => {
    const scale = 10 ** digits;
    return Math.abs(value * scale - Math.round(value * scale)) < 1e-6;
  };
