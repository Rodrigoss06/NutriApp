import { methodLabel } from '@nutricoach/contracts';
import { Text, View, type DocumentProps } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import type {
  MenuSheet,
  SheetMenuItem,
  SheetTotal,
  SheetTotals,
} from '../../../application/sheets/menu-sheet.js';
import { energyCard, patientLine } from './plan-parts.js';
import {
  emphasis,
  fixed,
  longDate,
  num,
  plain,
  section,
  sheetDocument,
  styles,
  table,
  type SheetFrame,
} from './sheet-kit.js';

/**
 * Ficha del menú semanal, versión 1.0.0 (RF-21, RN-H01): las metas con su método (RN-D02) y la adecuación del promedio
 * con los días en rango (RN-E10, RN-G09); cada día con lo de cada tiempo en su opción A y B, y su total con la opción A
 * (RN-E16); el promedio de la semana; cada receta con sus ingredientes y lo de una porción (RN-E12). Con la misma
 * plantilla, la dieta por composición como un plan de un día (RF-20, ADR-064). Un dato que falta se muestra como «al
 * menos» con en cuántos alimentos o días falta (RN-I03).
 */

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

type Unit = 'kcal' | 'g';

/** «1,850 kcal», «al menos 18 g · falta en 2 de 9 alimentos», «0 g · falta en …» o «sin dato» (ADR-061). */
function amount(total: SheetTotal, unit: Unit, of: number, counted: string): string {
  const kind = unit === 'kcal' ? 'kcal' : 'grams';
  if (total.value !== null) return `${num(total.value, kind)} ${unit}`;
  if (total.missing >= of) return 'sin dato';
  const missing = `falta en ${String(total.missing)} de ${String(of)} ${counted}`;
  const known = num(total.known, kind);
  return known === '0' ? `0 ${unit} · ${missing}` : `al menos ${known} ${unit} · ${missing}`;
}

function totalsLine(totals: SheetTotals, counted: string): string {
  return [
    amount(totals.kcal, 'kcal', totals.of, counted),
    `CHO ${amount(totals.cho, 'g', totals.of, counted)}`,
    `proteína ${amount(totals.protein, 'g', totals.of, counted)}`,
    `grasa ${amount(totals.fat, 'g', totals.of, counted)}`,
    `fibra ${amount(totals.fiber, 'g', totals.of, counted)}`,
  ].join(' · ');
}

function itemText(item: SheetMenuItem): string {
  if (item.kind === 'RECIPE') {
    return `${item.name} · ${plain(item.servings)} ${item.servings === 1 ? 'porción' : 'porciones'}`;
  }
  return `${item.name} · ${num(item.grams, 'grams')} g${item.householdText ? ` (${item.householdText})` : ''}`;
}

function targets(sheet: MenuSheet, frame: SheetFrame): ReactElement {
  const menu = sheet.modality === 'WEEKLY_MENU';
  const planned = menu && sheet.average ? sheet.average : sheet.days[0]?.totals;
  const counted = menu ? 'días' : 'alimentos';
  const [min, max] = sheet.adequacy.rangePct;
  const adequacy = (a: MenuSheet['adequacy']['kcal']) => {
    const parts = [`${a.missing > 0 ? 'al menos ' : ''}${num(a.pct, 'percent')} %`];
    if (menu) parts.push(`${String(a.daysInRange)} de ${String(a.days)} días en rango`);
    if (a.missing > 0) parts.push(`falta en ${String(a.missing)} de ${String(a.of)} ${counted}`);
    return parts.join(' · ');
  };
  const row = (
    label: string,
    target: string,
    total: SheetTotal | undefined,
    unit: Unit,
    a: MenuSheet['adequacy']['kcal'],
  ) => [
    label,
    target,
    total && planned ? amount(total, unit, planned.of, counted) : '—',
    adequacy(a),
  ];
  return section(
    'Metas del día',
    frame.colors,
    table(
      [
        { label: 'Nutriente', flex: 1.6 },
        { label: 'Meta', flex: 1.1, numeric: true },
        { label: menu ? 'Promedio de la semana' : 'Plan', flex: 2, numeric: true },
        {
          label: `${methodLabel('ADEQUACY')} (${num(min, 'percent')}–${num(max, 'percent')} %)`,
          flex: 2.6,
          numeric: true,
        },
      ],
      [
        row(
          'Energía',
          `${num(sheet.targets.kcal, 'kcal')} kcal`,
          planned?.kcal,
          'kcal',
          sheet.adequacy.kcal,
        ),
        row(
          'Carbohidratos',
          `${num(sheet.targets.choG, 'grams')} g`,
          planned?.cho,
          'g',
          sheet.adequacy.cho,
        ),
        row(
          'Proteína',
          `${num(sheet.targets.proteinG, 'grams')} g`,
          planned?.protein,
          'g',
          sheet.adequacy.protein,
        ),
        row(
          'Grasa',
          `${num(sheet.targets.fatG, 'grams')} g`,
          planned?.fat,
          'g',
          sheet.adequacy.fat,
        ),
      ],
    ),
    energyCard(sheet.energy),
  );
}

function itemsBlock(label: string | null, items: readonly SheetMenuItem[]): ReactElement {
  return h(
    View,
    { style: { marginTop: 2 } },
    label ? h(Text, { style: styles.strong }, label) : null,
    h(
      Text,
      { style: label ? [styles.muted, { marginLeft: 8 }] : styles.muted },
      items.length === 0 ? 'Sin nada en este tiempo.' : items.map(itemText).join('; '),
    ),
  );
}

function day(sheet: MenuSheet, frame: SheetFrame, index: number): ReactElement {
  const entry = sheet.days[index];
  if (!entry) return h(View);
  const menu = sheet.modality === 'WEEKLY_MENU';
  const title =
    entry.dayOfWeek === null ? 'Alimentos por tiempo' : (DAYS[entry.dayOfWeek - 1] ?? '');
  return section(
    title,
    frame.colors,
    ...sheet.meals.map((meal, m) => {
      const cell = entry.cells[m];
      return h(
        View,
        { key: m, style: [styles.card, { marginBottom: 6 }], wrap: false },
        h(
          Text,
          { style: [styles.subTitle, { color: frame.colors.primary.text }] },
          [meal.name, meal.timeOfDay, `${num(meal.sharePct, 'percent')} % del día`]
            .filter((part) => part)
            .join(' · '),
        ),
        menu ? itemsBlock('Opción A', cell?.optionA ?? []) : itemsBlock(null, cell?.optionA ?? []),
        menu && cell && cell.optionB.length > 0 ? itemsBlock('Opción B', cell.optionB) : null,
      );
    }),
    h(
      Text,
      { style: styles.note },
      `${menu ? 'Total del día con la opción A' : 'Total del día'}: ${totalsLine(entry.totals, 'alimentos')}.`,
    ),
  );
}

function recipes(sheet: MenuSheet, frame: SheetFrame): ReactElement | null {
  if (sheet.recipes.length === 0) return null;
  return section(
    'Recetas',
    frame.colors,
    ...sheet.recipes.map((recipe, index) =>
      h(
        View,
        { key: index, style: [styles.card, { marginBottom: 6 }], wrap: false },
        h(
          Text,
          { style: styles.subTitle },
          `${recipe.name} · rinde ${plain(recipe.servings)} ${recipe.servings === 1 ? 'porción' : 'porciones'}`,
        ),
        h(
          Text,
          { style: styles.muted },
          recipe.ingredients
            .map((ingredient) => `${ingredient.name} · ${num(ingredient.grams, 'grams')} g`)
            .join('; '),
        ),
        h(
          Text,
          null,
          ...emphasis(
            `${methodLabel('RECIPE_NUTRIENTS')}, una porción: `,
            totalsLine(recipe.perServing, 'ingredientes'),
            '.',
          ),
        ),
      ),
    ),
  );
}

export function weeklyMenuV1(sheet: MenuSheet, frame: SheetFrame): ReactElement<DocumentProps> {
  const menu = sheet.modality === 'WEEKLY_MENU';
  return sheetDocument(
    frame,
    patientLine(sheet.patient),
    targets(sheet, frame),
    sheet.hydrationMl === null
      ? null
      : section(
          'Agua',
          frame.colors,
          h(
            Text,
            null,
            ...emphasis('Meta de agua: ', `${fixed(sheet.hydrationMl, 0)} ml al día`, '.'),
          ),
        ),
    ...sheet.days.map((_, index) => day(sheet, frame, index)),
    menu && sheet.average
      ? section(
          'Promedio de la semana',
          frame.colors,
          h(Text, null, `${totalsLine(sheet.average, 'días')}.`),
        )
      : null,
    recipes(sheet, frame),
    sheet.instructions
      ? section('Indicaciones', frame.colors, h(Text, null, sheet.instructions))
      : null,
    h(
      View,
      { style: styles.section, wrap: false },
      h(
        Text,
        { style: styles.note },
        `Cálculos: ${sheet.methods
          .map((method) => `${methodLabel(method.methodCode)} ${method.methodVersion}`)
          .join(
            ' · ',
          )} · motor ${sheet.plan.engineVersion}. Plan publicado el ${longDate(sheet.plan.validFrom)}.`,
      ),
    ),
  );
}

/** El título y el subtítulo del encabezado: la composición se nombra como tal aunque use la ficha del menú. */
export function weeklyMenuTitles(sheet: MenuSheet): { title: string; subtitle: string } {
  return {
    title: sheet.modality === 'WEEKLY_MENU' ? 'Menú semanal' : 'Dieta por composición',
    subtitle: `Versión ${String(sheet.plan.versionNo)} · vale desde el ${longDate(sheet.plan.validFrom)}`,
  };
}
