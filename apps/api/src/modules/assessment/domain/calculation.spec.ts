import type { PopulationDefaults } from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import {
  effectivePreferences,
  planMethods,
  principalPurposes,
  type PreferenceRow,
} from './calculation-plan.js';
import { conditionDifferences, significance, type ComparedEvaluation } from './comparison.js';
import { interpret, type ReferenceRange } from './interpretation.js';

const ADULT: PopulationDefaults = {
  fatPct: 'FAT_DW1974_SIRI1961',
  muscle: ['MUSCLE_LEE2000', 'COMP4_DEROSE_GUIMARAES'],
  bone: 'BONE_ROCHA1975',
  priorityIndicators: [],
};
const CHILD: PopulationDefaults = {
  fatPct: null,
  muscle: [],
  bone: null,
  priorityIndicators: ['BMI', 'WAIST_HEIGHT'],
};

describe('RN-D05 · método por población: plataforma, organización y paciente', () => {
  it('la elección del paciente gana a la de la organización para su población, y esta a la plataforma', () => {
    const rows: PreferenceRow[] = [
      {
        organizationLevel: true,
        population: 'ADULT',
        purpose: 'FAT_PCT',
        methodCode: 'FAT_YUHASZ1974',
      },
      {
        organizationLevel: true,
        population: 'ATHLETE',
        purpose: 'FAT_PCT',
        methodCode: 'FAT_FAULKNER1968',
      },
    ];
    expect(effectivePreferences('ADULT', ADULT, []).FAT_PCT).toEqual({
      methodCode: 'FAT_DW1974_SIRI1961',
      source: 'PLATFORM',
    });
    expect(effectivePreferences('ADULT', ADULT, rows).FAT_PCT).toEqual({
      methodCode: 'FAT_YUHASZ1974',
      source: 'ORGANIZATION',
    });
    const patient: PreferenceRow = {
      organizationLevel: false,
      population: null,
      purpose: 'FAT_PCT',
      methodCode: 'FAT_FAULKNER1968',
    };
    expect(effectivePreferences('ADULT', ADULT, [...rows, patient]).FAT_PCT.source).toBe('PATIENT');
    expect(effectivePreferences('ADULT', ADULT, []).RMR).toEqual({
      methodCode: null,
      source: 'PLATFORM',
    });
  });

  it('una fila con un método que no es de su propósito se ignora', () => {
    const wrong: PreferenceRow = {
      organizationLevel: false,
      population: null,
      purpose: 'FAT_PCT',
      methodCode: 'RMR_MIFFLIN1990',
    };
    expect(effectivePreferences('ADULT', ADULT, [wrong]).FAT_PCT.source).toBe('PLATFORM');
  });
});

describe('RN-C01 · RN-D05 · plan de métodos por nivel y población', () => {
  it('el nivel básico solo ofrece indicadores; ISAK 1 suma 2 y 4 componentes y Lee; ISAK 2, Kerr y proporcionalidad', () => {
    const prefs = effectivePreferences('ADULT', ADULT, []);
    expect(planMethods('BASIC', ADULT, prefs).candidates).toEqual([
      'BMI',
      'WAIST_HEIGHT',
      'WAIST_HIP',
    ]);
    expect(planMethods('ISAK1', ADULT, prefs).candidates).not.toContain('COMP5_KERR1988');
    expect(planMethods('ISAK1', ADULT, prefs).excluded).toContainEqual({
      methodCode: 'CORMIC_INDEX',
      reason: 'LEVEL',
    });
    expect(planMethods('ISAK2', ADULT, prefs).candidates).toEqual([
      'BMI',
      'WAIST_HEIGHT',
      'WAIST_HIP',
      'FAT_DW1974_SIRI1961',
      'FAT_JP1978_7',
      'FAT_FAULKNER1968',
      'FAT_YUHASZ1974',
      'COMP4_DEROSE_GUIMARAES',
      'MUSCLE_LEE2000',
      'COMP5_KERR1988',
      'CORMIC_INDEX',
      'MANOUVRIER_INDEX',
      'ACROMIOILIAC_INDEX',
    ]);
    expect(planMethods(null, ADULT, prefs).candidates).toEqual(['BMI']);
  });

  it('niños, adolescentes y obesidad: sin pliegues ni masas por defecto, solo lo elegido', () => {
    const none = planMethods('ISAK2', CHILD, effectivePreferences('CHILD', CHILD, []));
    expect(none.candidates).toEqual([
      'BMI',
      'WAIST_HEIGHT',
      'WAIST_HIP',
      'CORMIC_INDEX',
      'MANOUVRIER_INDEX',
      'ACROMIOILIAC_INDEX',
    ]);
    expect(none.excluded).toContainEqual({
      methodCode: 'FAT_DW1974_SIRI1961',
      reason: 'POPULATION',
    });
    const chosen = effectivePreferences('CHILD', CHILD, [
      {
        organizationLevel: false,
        population: null,
        purpose: 'FAT_PCT',
        methodCode: 'FAT_DW1974_SIRI1961',
      },
    ]);
    const plan = planMethods('ISAK2', CHILD, chosen);
    expect(plan.candidates).toContain('FAT_DW1974_SIRI1961');
    expect(plan.candidates).not.toContain('FAT_YUHASZ1974');
    expect(plan.candidates).not.toContain('COMP4_DEROSE_GUIMARAES');
  });

  it('principal por propósito: el preferido si se calculó; en músculo, el primero de la plataforma que se calculó', () => {
    const prefs = effectivePreferences('ADULT', ADULT, []);
    const principal = principalPurposes(
      ['FAT_DW1974_SIRI1961', 'FAT_YUHASZ1974', 'COMP4_DEROSE_GUIMARAES', 'MUSCLE_LEE2000'],
      ADULT,
      prefs,
    );
    expect(principal.get('FAT_DW1974_SIRI1961')).toEqual(['FAT_PCT']);
    expect(principal.get('MUSCLE_LEE2000')).toEqual(['MUSCLE']);
    expect(principal.get('COMP4_DEROSE_GUIMARAES')).toEqual(['BONE']);
    const withoutLee = principalPurposes(
      ['FAT_YUHASZ1974', 'COMP4_DEROSE_GUIMARAES'],
      ADULT,
      prefs,
    );
    expect(withoutLee.get('FAT_YUHASZ1974')).toBeUndefined();
    expect(withoutLee.get('COMP4_DEROSE_GUIMARAES')).toEqual(['MUSCLE', 'BONE']);
  });
});

describe('RN-D10 · interpretación con fuente, sobre el valor sin redondear', () => {
  const range = (overrides: Partial<ReferenceRange>): ReferenceRange => ({
    id: 'r',
    organizationId: null,
    metricCode: 'WAIST_HEIGHT_RATIO',
    sex: null,
    minAge: 18,
    maxAge: null,
    population: null,
    minValue: null,
    maxValue: 0.5,
    label: 'Sin riesgo aumentado',
    tone: 'NEUTRAL',
    source: 'Fuente',
    ...overrides,
  });
  const adult = { sex: 'M', ageYears: 28, population: 'ADULT' } as const;
  const ranges = [
    range({}),
    range({ minValue: 0.5, maxValue: null, label: 'Riesgo', tone: 'CAUTION' }),
  ];

  it('intervalos semiabiertos: 0.4996 sigue bajo el umbral aunque se muestre 0.50; 0.5 ya cuenta', () => {
    expect(interpret('WAIST_HEIGHT_RATIO', 0.4996, adult, ranges)?.label).toBe(
      'Sin riesgo aumentado',
    );
    expect(interpret('WAIST_HEIGHT_RATIO', 0.5, adult, ranges)?.tone).toBe('CAUTION');
  });

  it('sin rango para la edad o el indicador no hay interpretación; el de la organización gana', () => {
    expect(interpret('WAIST_HEIGHT_RATIO', 0.45, { ...adult, ageYears: 12 }, ranges)).toBeNull();
    expect(interpret('BMI', 26, adult, ranges)).toBeNull();
    const own = range({ id: 'o', organizationId: 'org', label: 'Propio', source: 'Organización' });
    expect(interpret('WAIST_HEIGHT_RATIO', 0.45, adult, [...ranges, own])?.label).toBe('Propio');
  });
});

describe('RN-C06 · RN-C09 · comparación con la evaluación anterior', () => {
  const at = (
    minutesOfDay: number,
    overrides: Partial<ComparedEvaluation> = {},
  ): ComparedEvaluation => ({
    evaluatorMemberId: 'm-1',
    conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false, hydration: null },
    minutesOfDay,
    ...overrides,
  });

  it('⚠️ difieren por evaluador, ayuno, actividad o más de 2 h en la hora del día (también pasada la medianoche)', () => {
    expect(conditionDifferences(at(510), at(510 + 120))).toEqual([]);
    expect(conditionDifferences(at(510), at(510 + 121))).toEqual(['TIME_OF_DAY']);
    expect(conditionDifferences(at(23 * 60 + 30), at(30))).toEqual([]);
    expect(
      conditionDifferences(
        at(510, {
          evaluatorMemberId: 'm-2',
          conditions: {
            schemaVersion: 1,
            fasting: false,
            intenseActivityLast24h: true,
            hydration: null,
          },
        }),
        at(510),
      ),
    ).toEqual(['EVALUATOR', 'FASTING', 'INTENSE_ACTIVITY']);
  });

  it('un cambio que no supera el CMD95 es «sin cambio significativo»; sin ETM, desconocido', () => {
    expect(significance(-6.9, 6.18)).toBe('CHANGE');
    expect(significance(-1.5, 1.96)).toBe('NO_SIGNIFICANT_CHANGE');
    expect(significance(1.96, 1.96)).toBe('NO_SIGNIFICANT_CHANGE');
    expect(significance(-1.5, null)).toBe('UNKNOWN');
  });
});
