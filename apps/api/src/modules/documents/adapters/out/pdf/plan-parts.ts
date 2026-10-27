import { methodLabel } from '@nutricoach/contracts';
import { Text, View } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import type { EnergySummary } from '../../../../nutrition/index.js';
import type { SheetPatient } from '../../../application/sheets/sheet-content.js';
import { emphasis, fixed, num, styles } from './sheet-kit.js';

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
