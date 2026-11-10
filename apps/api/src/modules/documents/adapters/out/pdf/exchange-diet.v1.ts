import { methodLabel } from '@nutricoach/contracts';
import { Text, View, type DocumentProps } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import type { ExchangeDietSheet } from '../../../application/sheets/sheet-content.js';
import {
  emphasis,
  fixed,
  longDate,
  num,
  section,
  sheetDocument,
  styles,
  table,
  type SheetFrame,
} from './sheet-kit.js';
import { dayProfilesSection, energyCard, patientLine } from './plan-parts.js';

/**
 * Ficha de la dieta por intercambios, versión 1.0.0 (RF-24, RN-H01): metas con su método (RN-D02, RN-H04), lo que
 * aporta el plan con su adecuación (RN-E10), los intercambios del día de la lista y versión del plan (RN-E11), cada
 * tiempo de comida con lo que el paciente puede elegir y su porción, la meta de agua (RN-E13) y las indicaciones.
 * Lo que se publica no cambia: cambiar cómo se ve exige una versión nueva de la plantilla.
 */

const exchanges = (value: number): string =>
  `${num(value, 'exchanges')} ${value === 1 ? 'intercambio' : 'intercambios'}`;

function targets(sheet: ExchangeDietSheet, frame: SheetFrame): ReactElement {
  const { energy, targets: t, totals, adequacy } = sheet;
  const adequacyCell = (a: { pct: number; inRange: boolean }) =>
    `${num(a.pct, 'percent')} %${a.inRange ? '' : ' · fuera de rango'}`;
  const [min, max] = adequacy.rangePct;
  return section(
    'Metas del día',
    frame.colors,
    table(
      [
        { label: 'Nutriente', flex: 2 },
        { label: 'Meta', flex: 1.2, numeric: true },
        { label: 'Plan', flex: 1.2, numeric: true },
        {
          label: `${methodLabel('ADEQUACY')} (${num(min, 'percent')}–${num(max, 'percent')} %)`,
          flex: 2.4,
          numeric: true,
        },
      ],
      [
        [
          'Energía',
          `${num(t.kcal, 'kcal')} kcal`,
          `${num(totals.kcal, 'kcal')} kcal`,
          adequacyCell(adequacy.kcal),
        ],
        [
          'Carbohidratos',
          `${num(t.choG, 'grams')} g`,
          `${num(totals.choG, 'grams')} g`,
          adequacyCell(adequacy.cho),
        ],
        [
          'Proteína',
          `${num(t.proteinG, 'grams')} g`,
          `${num(totals.proteinG, 'grams')} g`,
          adequacyCell(adequacy.protein),
        ],
        [
          'Grasa',
          `${num(t.fatG, 'grams')} g`,
          `${num(totals.fatG, 'grams')} g`,
          adequacyCell(adequacy.fat),
        ],
      ],
    ),
    energyCard(energy),
  );
}

function groups(sheet: ExchangeDietSheet, frame: SheetFrame): ReactElement {
  const provisional = sheet.list.provisional ? ' · provisional' : '';
  return section(
    'Intercambios del día',
    frame.colors,
    h(
      Text,
      { style: [styles.note, { marginBottom: 4 }] },
      `${methodLabel('EXCHANGES_CLASSIC')} con la lista ${sheet.list.name}, versión ${sheet.list.version}${provisional}.`,
    ),
    table(
      [
        { label: 'Grupo', flex: 2.2 },
        { label: 'Intercambios', flex: 1.3, numeric: true },
        { label: 'Un intercambio aporta', flex: 3.5, numeric: true },
      ],
      sheet.groups.map((group) => [
        group.name,
        num(group.servings, 'exchanges'),
        `${num(group.kcal, 'kcal')} kcal · CHO ${num(group.choG, 'grams')} g · proteína ${num(group.proteinG, 'grams')} g · grasa ${num(group.fatG, 'grams')} g`,
      ]),
    ),
  );
}

function meals(sheet: ExchangeDietSheet, frame: SheetFrame): ReactElement {
  return section(
    'Tiempos de comida',
    frame.colors,
    h(
      Text,
      { style: [styles.note, { marginBottom: 4 }] },
      `${methodLabel('MEAL_SPLIT_LARGEST_REMAINDER')}: elige un alimento de cada grupo por cada intercambio, en la porción indicada.`,
    ),
    ...sheet.meals.map((meal, index) =>
      h(
        View,
        { key: index, style: [styles.card, { marginBottom: 6 }], wrap: false },
        h(
          Text,
          { style: [styles.subTitle, { color: frame.colors.primary.text }] },
          [meal.name, meal.timeOfDay, `${num(meal.sharePct, 'percent')} % del día`]
            .filter((part) => part)
            .join(' · '),
        ),
        ...(meal.exchanges.length === 0
          ? [h(Text, { style: styles.muted }, 'Sin intercambios en este tiempo.')]
          : meal.exchanges.map((exchange, e) =>
              h(
                View,
                { key: e, style: { marginTop: 2 } },
                h(
                  Text,
                  null,
                  ...emphasis('', exchange.groupName, ` · ${exchanges(exchange.servings)}`),
                ),
                exchange.foods.length > 0
                  ? h(
                      Text,
                      { style: [styles.muted, { marginLeft: 8 }] },
                      exchange.foods
                        .map(
                          (food) =>
                            `${food.name} · ${num(food.grams, 'grams')} g${food.householdText ? ` (${food.householdText})` : ''}`,
                        )
                        .join('; '),
                    )
                  : null,
              ),
            )),
      ),
    ),
  );
}

/**
 * Los almidones de cada tiempo en cada perfil de día (07 §2, P-20.5; plantilla 1.2.0): el perfil es el mismo plan con más o
 * menos almidones, y lo demás no cambia. Sin perfiles con sus almidones (o lo publicado antes), nada.
 */
function profileStarch(sheet: ExchangeDietSheet, frame: SheetFrame): ReactElement | null {
  const profiles = sheet.dayProfiles.flatMap((profile) =>
    profile.starchByMeal ? [{ name: profile.name, starchByMeal: profile.starchByMeal }] : [],
  );
  if (profiles.length === 0) return null;
  const starch = sheet.groups.find((group) => group.code === 'STA')?.name ?? 'Almidones';
  return section(
    `${starch} por perfil de día`,
    frame.colors,
    table(
      [
        { label: 'Tiempo', flex: 2.2 },
        { label: 'Entrenamiento', flex: 1.3, numeric: true },
        ...profiles.map((profile) => ({ label: profile.name, flex: 1.3, numeric: true })),
      ],
      sheet.meals.map((meal, index) => [
        meal.name,
        num(meal.exchanges.find((e) => e.groupName === starch)?.servings ?? 0, 'exchanges'),
        ...profiles.map((profile) => num(profile.starchByMeal[index] ?? 0, 'exchanges')),
      ]),
    ),
    h(
      Text,
      { style: styles.note },
      `En cada perfil cambian solo los ${starch.toLocaleLowerCase('es')}; lo demás es igual que el plan. Sugerencia de ${methodLabel('STARCH_BY_DAY_PROFILE')}, que el profesional ajusta.`,
    ),
  );
}

function exchangeDiet(
  sheet: ExchangeDietSheet,
  frame: SheetFrame,
  version: { readonly profiles: boolean; readonly portions: boolean },
): ReactElement<DocumentProps> {
  const { patient } = sheet;
  return sheetDocument(
    frame,
    patientLine(patient),
    targets(sheet, frame),
    version.profiles ? dayProfilesSection(sheet.targets, sheet.dayProfiles, frame) : null,
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
    groups(sheet, frame),
    meals(sheet, frame),
    version.portions ? profileStarch(sheet, frame) : null,
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

/** El título y el subtítulo del encabezado de esta ficha. */
/** Versión 1.0.0: la de P11, igual para volver a dibujar lo que ya se generó (RN-H02). */
export const exchangeDietV1 = (sheet: ExchangeDietSheet, frame: SheetFrame) =>
  exchangeDiet(sheet, frame, { profiles: false, portions: false });

/** Versión 1.1.0 (P14.5): además, la meta de cada perfil de día (07 §2). */
export const exchangeDietV110 = (sheet: ExchangeDietSheet, frame: SheetFrame) =>
  exchangeDiet(sheet, frame, { profiles: true, portions: false });

/** Versión 1.2.0 (P14.5): además, los almidones de cada tiempo en cada perfil (P-20.5). */
export const exchangeDietV120 = (sheet: ExchangeDietSheet, frame: SheetFrame) =>
  exchangeDiet(sheet, frame, { profiles: true, portions: true });

export function exchangeDietTitles(sheet: ExchangeDietSheet): { title: string; subtitle: string } {
  return {
    title: 'Dieta por intercambios',
    subtitle: `Versión ${String(sheet.plan.versionNo)} · vale desde el ${longDate(sheet.plan.validFrom)}`,
  };
}
