import { domainError } from '@nutricoach/shared-kernel';

/** El alimento no existe o es de otra organización: para ella no existe (RN-A01). */
export const FOOD_NOT_FOUND = domainError({
  code: 'NC-FOOD-002',
  message: 'No encontramos ese alimento.',
});

/** Los catálogos globales son de solo lectura para las organizaciones (RN-I01). */
export const GLOBAL_FOOD_READ_ONLY = domainError({
  code: 'NC-FOOD-003',
  rule: 'RN-I01',
  message: 'Los alimentos de referencia no se editan: crea uno propio.',
});

/** Alguien editó el alimento antes (If-Match). */
export const FOOD_VERSION_CONFLICT = domainError({
  code: 'NC-FOOD-004',
  message: 'El alimento cambió mientras lo editabas: vuelve a abrirlo.',
});

/** Una medida casera solo vale para su alimento (RN-E12). */
export const MEASURE_NOT_OF_FOOD = domainError({
  code: 'NC-FOOD-005',
  rule: 'RN-E12',
  message: 'Esa medida casera no es de ese alimento.',
});

/** La receta no existe o es de otra organización: para ella no existe (RN-A01). */
export const RECIPE_NOT_FOUND = domainError({
  code: 'NC-FOOD-006',
  message: 'No encontramos esa receta.',
});

/** Alguien editó la receta antes (If-Match). */
export const RECIPE_VERSION_CONFLICT = domainError({
  code: 'NC-FOOD-008',
  message: 'La receta cambió mientras la editabas: vuelve a abrirla.',
});
