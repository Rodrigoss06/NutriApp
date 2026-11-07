import type { AppSection, MySheetItem } from '@nutricoach/contracts';

/** La sección de la app de cada ficha: el profesional decide qué ve el paciente (RF-27). */
const SECTION_OF = {
  PLAN: 'NUTRITION',
  PROGRAM: 'TRAINING',
  RESULTS: 'EVOLUTION',
  EVOLUTION: 'EVOLUTION',
} as const satisfies Record<MySheetItem, AppSection>;

/** Las fichas que la app muestra: las vigentes de la API cuya sección está a la vista. */
export function visibleSheets(
  items: readonly MySheetItem[],
  sections: readonly AppSection[],
): MySheetItem[] {
  const shown = new Set(sections);
  return items.filter((item) => shown.has(SECTION_OF[item]));
}
