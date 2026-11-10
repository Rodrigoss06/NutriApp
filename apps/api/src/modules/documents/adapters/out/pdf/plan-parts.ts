import { methodLabel } from '@nutricoach/contracts';
import { Text, View } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import type { EnergySummary } from '../../../../nutrition/index.js';
import type { SheetDayProfile, SheetPatient } from '../../../application/sheets/sheet-content.js';
import { emphasis, fixed, num, section, styles, table, type SheetFrame } from './sheet-kit.js';

/** Piezas de las fichas de un plan (intercambios, menú y composición): el paciente y de dónde salen las metas. */

const SEX = { M: 'Hombre', F: 'Mujer' } as const;

export function patientLine(patient: SheetPatient): ReactElement {
  return h(
    View,
    { style: styles.row },
    h(
      Text,
      null,
      ...emphasis(
        'Paciente: ',
        patient.fullName,
        ` (${patient.code}) · ${String(patient.ageYears)} años · ${SEX[patient.sex]}`,
      ),
    ),
  );
}

function adjustment(kcal: number): string {
  if (Math.round(kcal) === 0) return 'sin ajuste por objetivo';
  return kcal < 0
    ? `déficit de ${num(-kcal, 'kcal')} kcal`
    : `superávit de ${num(kcal, 'kcal')} kcal`;
}

/**
 * De dónde salen las metas, cada número con su método (RN-D02): la TMR, el PAL, el ejercicio, el ajuste del objetivo y
 * el reparto de macronutrientes. Sin la prescripción a la vista, nada.
 */
export function energyCard(energy: EnergySummary | null): ReactElement | null {
  if (!energy) return null;
  return h(
    View,
    { style: [styles.card, { marginTop: 6 }] },
    h(
      Text,
      null,
      ...emphasis(
        'Energía: ',
        `${methodLabel(energy.rmr.methodCode)} ${num(energy.rmr.kcal, 'kcal')} kcal`,
        ` × PAL ${fixed(energy.pal, 2)}`,
        energy.strategy === 'ADDITIVE'
          ? ` + ejercicio ${num(energy.exerciseKcal, 'kcal')} kcal`
          : ' (el ejercicio va en el PAL)',
        ` = ${methodLabel(energy.tee.methodCode)} `,
        `${num(energy.tee.kcal, 'kcal')} kcal`,
        `; ${adjustment(energy.adjustmentKcal)}: meta de `,
        `${num(energy.targetKcal, 'kcal')} kcal`,
        '.',
      ),
    ),
    h(
      Text,
      null,
      ...emphasis(
        `${methodLabel(energy.macros.methodCode)}: proteína `,
        `${fixed(energy.macros.proteinGPerKg, 1)} g/kg`,
        ' de peso, grasa ',
        `${num(energy.macros.fatPctKcal, 'percent')} %`,
        ' de las kcal y carbohidratos con lo que queda.',
      ),
    ),
  );
}

/**
 * Las metas de cada perfil de día del plan (07 §2, P-20; plantillas 1.1.0): Entrenamiento, que es la de la prescripción, y los
 * demás con sus gramos y las kcal que salen de ellos, con su método (RN-H04). Sin perfiles no dibuja nada.
 */
export function dayProfilesSection(
  training: {
    readonly kcal: number;
    readonly choG: number;
    readonly proteinG: number;
    readonly fatG: number;
  },
  profiles: readonly SheetDayProfile[],
  frame: SheetFrame,
): ReactElement | null {
  if (profiles.length === 0) return null;
  const row = (name: string, p: typeof training) => [
    name,
    `${num(p.kcal, 'kcal')} kcal`,
    `${num(p.choG, 'grams')} g`,
    `${num(p.proteinG, 'grams')} g`,
    `${num(p.fatG, 'grams')} g`,
  ];
  return section(
    'Metas por perfil de día',
    frame.colors,
    table(
      [
        { label: 'Perfil de día', flex: 2.2 },
        { label: 'Energía', flex: 1.2, numeric: true },
        { label: 'Carbohidratos', flex: 1.3, numeric: true },
        { label: 'Proteína', flex: 1.1, numeric: true },
        { label: 'Grasa', flex: 1, numeric: true },
      ],
      [
        row('Entrenamiento (prescripción)', training),
        ...profiles.map((profile) => row(profile.name, profile)),
      ],
    ),
    h(
      Text,
      { style: styles.note },
      `Las kcal de cada perfil salen de sus gramos: ${methodLabel('MACROS_DAY_PROFILE')}. El programa elige el perfil de cada día.`,
    ),
  );
}
