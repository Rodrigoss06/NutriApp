import type { FoodState, VALUE_FLAGS } from '@nutricoach/contracts';

/** Textos del catálogo de alimentos (interfaz en español, regla 9). */
export const FOOD_STATE_LABELS = {
  RAW: 'Crudo',
  COOKED: 'Cocido',
  PROCESSED: 'Procesado',
  READY: 'Listo para comer',
} as const satisfies Record<FoodState, string>;

/** Para elegir el estado de un alimento propio: RAW es «crudo o tal como se compra» (ADR-052). */
export const FOOD_STATE_OPTIONS = {
  RAW: 'Crudo o tal como se compra',
  COOKED: 'Cocido',
  PROCESSED: 'Procesado',
  READY: 'Listo para comer',
} as const satisfies Record<FoodState, string>;

/** Calidad del valor (RN-I03). «Sin dato» no se rotula aquí: lo dice el propio valor. */
export const VALUE_FLAG_LABELS = {
  MEASURED: 'Medido',
  CALCULATED: 'Calculado',
  TRACE: 'Trazas',
  MISSING: 'Sin dato',
  IMPUTED: 'Imputado de otra tabla',
} as const satisfies Record<(typeof VALUE_FLAGS)[number], string>;

/** La fuente en una línea; el nombre completo y su edición están en el detalle (RN-I02). */
export const sourceLabel = (sourceCode: string): string =>
  ({ TPCA_2017: 'TPCA 2017', ORG: 'Propio' })[sourceCode] ?? sourceCode;
