/** Estado en que valen los nutrientes y los gramos de un alimento (RN-E12), como food.food.state. */
export type FoodState = 'RAW' | 'COOKED' | 'PROCESSED' | 'READY';

/** Cómo se coció: cocido, sancochado, frito, asado, hervido, horneado, guisado, tostado o precocido. */
const COOKING = /^(?:pre)?(?:cocid|sancochad|frit|asad|hervid|hornead|guisad|tostad)[oa]s?$/;

/**
 * El estado que dice el nombre oficial de una fuente (ADR-052): COOKED si nombra una cocción; si no, RAW, que es
 * crudo o tal como se compra. Solo mira palabras enteras del nombre: ni adivina ni marca PROCESSED o READY, que
 * quedan para los alimentos propios y las preparaciones.
 */
export function stateFromName(name: string): FoodState {
  const words = name.toLocaleLowerCase('es').split(/[^\p{L}]+/u);
  return words.some((word) => COOKING.test(word)) ? 'COOKED' : 'RAW';
}

const RAW = /^crud[oa]s?$/;

/**
 * El estado que pide un término de búsqueda: COOKED si nombra una cocción («arroz cocido»), RAW si dice crudo; si no
 * dice nada, null y la búsqueda no prefiere ninguno.
 */
export function stateHint(term: string): FoodState | null {
  const words = term.toLocaleLowerCase('es').split(/[^\p{L}]+/u);
  if (words.some((word) => COOKING.test(word))) return 'COOKED';
  return words.some((word) => RAW.test(word)) ? 'RAW' : null;
}
