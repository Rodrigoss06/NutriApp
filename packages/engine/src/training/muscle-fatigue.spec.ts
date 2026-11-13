import { describe, expect, it } from 'vitest';
import { runMethod } from '../registry/run-method.js';
import {
  FATIGUE_FAMILIES,
  fatigueFamilyOf,
  MUSCLE_FATIGUE_JV,
  type FamilyCoefficients,
  type FatigueFamily,
  type MuscleFatigueInput,
  type MuscleFatigueThresholds,
  type MuscleVolume,
} from './muscle-fatigue.js';
import { MOVEMENT_PATTERNS } from './routine-proposal.js';

// P-27, respuesta de Jeremy (2026-11-10): el estado con los umbrales de P-23 (ámbar sobre +15 % y rojo sobre +30 % de la base) y
// la recuperación estimada en 48, 60 y 72 h.
const JV: MuscleFatigueThresholds = {
  loadAmberAbovePct: 15,
  loadRedAbovePct: 30,
  recoveryGreenHours: 48,
  recoveryAmberHours: 60,
  recoveryRedHours: 72,
};

// P-27, respuesta de Jeremy (2026-11-10): fatiga muscular, fatiga neural, carga axial y demanda técnica de cada familia.
const COEFFICIENTS: FamilyCoefficients[] = [
  {
    family: 'LEG_HIP',
    muscularFatigue: 1.2,
    neuralFatigue: 1.3,
    axialLoad: 1.3,
    technicalDemand: 1.2,
  },
  {
    family: 'FREE_TORSO',
    muscularFatigue: 1.1,
    neuralFatigue: 1.1,
    axialLoad: 1.0,
    technicalDemand: 1.1,
  },
  {
    family: 'GUIDED',
    muscularFatigue: 1.0,
    neuralFatigue: 1.0,
    axialLoad: 0.8,
    technicalDemand: 0.9,
  },
  {
    family: 'ISOLATION',
    muscularFatigue: 0.9,
    neuralFatigue: 0.7,
    axialLoad: 0.5,
    technicalDemand: 0.8,
  },
  {
    family: 'MOBILITY_CARDIO',
    muscularFatigue: 0,
    neuralFatigue: 0,
    axialLoad: 0,
    technicalDemand: 0,
  },
];

const muscles = (volumes: Readonly<Record<string, number | null>>): MuscleVolume[] =>
  Object.entries(volumes).map(([muscleCode, adjustedVolumeKg]) => ({
    muscleCode,
    adjustedVolumeKg,
  }));

type FatigueCase = Omit<MuscleFatigueInput, 'thresholds' | 'coefficients'> &
  Partial<Pick<MuscleFatigueInput, 'coefficients'>>;

const fatigue = (input: FatigueCase, thresholds = JV) => {
  const run = runMethod(MUSCLE_FATIGUE_JV, { coefficients: COEFFICIENTS, ...input, thresholds });
  if (!run.ok) throw new Error(JSON.stringify(run.errors));
  return run.result;
};

const rowOf = (result: ReturnType<typeof fatigue>, code: string) =>
  result.outputs.muscles.find((row) => row.muscleCode === code);

// Las semanas 2 a 4 de una hoja como la de Mateo: el press banca da 1,419 de promedio al pecho (principal, 1.0) y la mitad al
// tríceps (secundario, 0.5), como decidió Rodrigo el 2026-11-11.
const PREVIOUS = [
  { adjustedVolumeKg: 5490, muscles: muscles({ CHEST: 1350, TRICEPS: 675, QUADRICEPS: 2000 }) },
  { adjustedVolumeKg: 6336, muscles: muscles({ CHEST: 1500, TRICEPS: 750, QUADRICEPS: 2400 }) },
  { adjustedVolumeKg: 3375, muscles: muscles({ CHEST: 1407, TRICEPS: 703.5 }) },
];

describe('RN-G18 · P-27 · fatiga por grupo muscular de la hoja piloto', () => {
  it('la base de cada grupo es el promedio de las 3 semanas previas con volumen: Pecho 1,419 y Tríceps 709.5', () => {
    const result = fatigue({
      muscles: muscles({ CHEST: 1419, TRICEPS: 709.5 }),
      previousWeeks: PREVIOUS,
    });
    expect(rowOf(result, 'CHEST')).toEqual({
      muscleCode: 'CHEST',
      trainingFatigueKg: 1419,
      baseVolumeKg: 1419,
      changePct: 0,
      state: 'GREEN',
      recoveryHours: 48,
      coefficients: null,
    });
    expect(rowOf(result, 'TRICEPS')?.baseVolumeKg).toBe(709.5);
    expect(result.outputs.baseWeeks).toBe(3);
    expect(result.methodCode).toBe('MUSCLE_FATIGUE_JV');
    expect(result.methodVersion).toBe('1.1.0');
  });

  it('una semana previa con volumen en la que el grupo no se entrenó cuenta como 0: Cuádriceps (2,000 + 2,400 + 0) ÷ 3', () => {
    const result = fatigue({ muscles: muscles({ QUADRICEPS: 1500 }), previousWeeks: PREVIOUS });
    expect(rowOf(result, 'QUADRICEPS')?.baseVolumeKg).toBeCloseTo(4400 / 3, 9);
  });

  it('P-24 · las semanas previas sin volumen no entran en la base: ni en la suma ni en el divisor', () => {
    const result = fatigue({
      muscles: muscles({ CHEST: 1000 }),
      previousWeeks: [
        { adjustedVolumeKg: 3375, muscles: muscles({ CHEST: 1407 }) },
        { adjustedVolumeKg: null, muscles: muscles({ CHEST: null }) },
        { adjustedVolumeKg: 0, muscles: [] },
      ],
    });
    expect(rowOf(result, 'CHEST')?.baseVolumeKg).toBe(1407);
    expect(result.outputs.baseWeeks).toBe(1);
  });

  it('P-23 · verde hasta +15 %, ámbar hasta +30 % y rojo sobre +30 %, con 48, 60 y 72 h de recuperación', () => {
    const at = (volume: number) =>
      rowOf(
        fatigue({
          muscles: muscles({ CHEST: volume }),
          previousWeeks: [{ adjustedVolumeKg: 1000, muscles: muscles({ CHEST: 1000 }) }],
        }),
        'CHEST',
      );
    expect(at(1150)).toMatchObject({ state: 'GREEN', recoveryHours: 48 });
    expect(at(1151)).toMatchObject({ state: 'AMBER', recoveryHours: 60 });
    // +30 % exacto sigue en ámbar: se compara sin dividir.
    expect(at(1300)).toMatchObject({ state: 'AMBER', recoveryHours: 60 });
    expect(at(1301)).toMatchObject({ state: 'RED', recoveryHours: 72 });
    expect(at(600)).toMatchObject({ state: 'GREEN', changePct: -40, recoveryHours: 48 });
  });

  it('un grupo con base y sin volumen en la semana queda «faltan datos», como la semana 5 de la hoja', () => {
    const result = fatigue({ muscles: [], previousWeeks: PREVIOUS });
    expect(result.outputs.muscles.map((row) => row.muscleCode)).toEqual([
      'CHEST',
      'TRICEPS',
      'QUADRICEPS',
    ]);
    expect(rowOf(result, 'CHEST')).toEqual({
      muscleCode: 'CHEST',
      trainingFatigueKg: null,
      baseVolumeKg: 1419,
      changePct: null,
      state: 'NO_DATA',
      recoveryHours: null,
      coefficients: null,
    });
  });

  it('sin semanas previas con volumen, o con el grupo en 0 en todas, queda «sin base» y sin recuperación estimada', () => {
    const first = fatigue({ muscles: muscles({ CHEST: 1200 }), previousWeeks: [] });
    expect(rowOf(first, 'CHEST')).toMatchObject({
      baseVolumeKg: null,
      changePct: null,
      state: 'NO_BASE',
      recoveryHours: null,
    });
    const newMuscle = fatigue({ muscles: muscles({ CALVES: 300 }), previousWeeks: PREVIOUS });
    expect(rowOf(newMuscle, 'CALVES')).toMatchObject({
      baseVolumeKg: 0,
      changePct: null,
      state: 'NO_BASE',
    });
  });

  it('primero los grupos de la semana, en su orden, y después los que solo están en la base', () => {
    const result = fatigue({
      muscles: muscles({ GLUTES: 800, CHEST: null }),
      previousWeeks: PREVIOUS,
    });
    expect(result.outputs.muscles.map((row) => row.muscleCode)).toEqual([
      'GLUTES',
      'CHEST',
      'TRICEPS',
      'QUADRICEPS',
    ]);
    expect(rowOf(result, 'CHEST')?.state).toBe('NO_DATA');
  });

  it('insumos fuera de rango o umbrales cruzados dan su código', () => {
    const error = (input: FatigueCase, thresholds = JV) => {
      const run = runMethod(MUSCLE_FATIGUE_JV, {
        coefficients: COEFFICIENTS,
        ...input,
        thresholds,
      });
      if (run.ok) return null;
      expect(run.errors.map((issue) => issue.rule)).toEqual(run.errors.map(() => 'RN-G18'));
      return run.errors.map((issue) => issue.code);
    };
    expect(error({ muscles: muscles({ CHEST: -1 }), previousWeeks: [] })).toEqual(['NC-ENG-415']);
    expect(
      error({ muscles: [...muscles({ CHEST: 1 }), ...muscles({ CHEST: 2 })], previousWeeks: [] }),
    ).toEqual(['NC-ENG-415']);
    expect(error({ muscles: [], previousWeeks: [...PREVIOUS, ...PREVIOUS] })).toEqual([
      'NC-ENG-415',
    ]);
    expect(error({ muscles: [], previousWeeks: [] }, { ...JV, recoveryAmberHours: 80 })).toEqual([
      'NC-ENG-416',
    ]);
    expect(error({ muscles: [], previousWeeks: [] }, { ...JV, loadAmberAbovePct: 40 })).toEqual([
      'NC-ENG-416',
    ]);
  });
});

// P-27.1, respuestas de Rodrigo (2026-11-12): en cada grupo, el coeficiente de las familias que lo trabajaron, promediado según el
// volumen que cada una le dio (con 1.0 y 0.5). Solo se muestran: no cambian el estado ni la recuperación estimada.
describe('RN-G18 · P-27.1 · coeficientes por grupo muscular', () => {
  const trained = (
    muscleCode: string,
    families: Readonly<Partial<Record<FatigueFamily, number>>>,
  ): MuscleVolume => {
    const list = Object.entries(families).map(([family, adjustedVolumeKg]) => ({
      family: family as FatigueFamily,
      adjustedVolumeKg,
    }));
    return {
      muscleCode,
      adjustedVolumeKg: list.reduce((total, item) => total + item.adjustedVolumeKg, 0),
      families: list,
    };
  };

  it('Pecho en la semana 3 de Mateo: solo el press banca (torso libre), 1,782 kg, da 1.1, 1.1, 1.0 y 1.1', () => {
    const result = fatigue({
      muscles: [trained('CHEST', { FREE_TORSO: 1782 })],
      previousWeeks: [],
    });
    expect(rowOf(result, 'CHEST')?.coefficients).toEqual({
      muscularFatigue: 1.1,
      neuralFatigue: 1.1,
      axialLoad: 1.0,
      technicalDemand: 1.1,
    });
  });

  it('con varias familias pesa el volumen de cada una: Tríceps 891 del press banca (0.5) y 600 de polea (aislamiento)', () => {
    const result = fatigue({
      muscles: [trained('TRICEPS', { FREE_TORSO: 891, ISOLATION: 600 })],
      previousWeeks: [],
    });
    const coefficients = rowOf(result, 'TRICEPS')?.coefficients;
    expect(coefficients?.muscularFatigue).toBeCloseTo((891 * 1.1 + 600 * 0.9) / 1491, 12);
    expect(coefficients?.neuralFatigue).toBeCloseTo((891 * 1.1 + 600 * 0.7) / 1491, 12);
    expect(coefficients?.axialLoad).toBeCloseTo((891 * 1.0 + 600 * 0.5) / 1491, 12);
    expect(coefficients?.technicalDemand).toBeCloseTo((891 * 1.1 + 600 * 0.8) / 1491, 12);
  });

  it('movilidad y cardio pesan con 0: 500 kg de movilidad y 500 de aislamiento dan la mitad del aislamiento', () => {
    const result = fatigue({
      muscles: [trained('ROTATOR_CUFF', { MOBILITY_CARDIO: 500, ISOLATION: 500 })],
      previousWeeks: [],
    });
    const coefficients = rowOf(result, 'ROTATOR_CUFF')?.coefficients;
    expect(coefficients?.muscularFatigue).toBeCloseTo(0.45, 12);
    expect(coefficients?.neuralFatigue).toBeCloseTo(0.35, 12);
    expect(coefficients?.axialLoad).toBeCloseTo(0.25, 12);
    expect(coefficients?.technicalDemand).toBeCloseTo(0.4, 12);
  });

  it('sin volumen en la semana, solo en la base o sin familias, no hay coeficientes', () => {
    const result = fatigue({
      muscles: [
        { muscleCode: 'CHEST', adjustedVolumeKg: null, families: [] },
        { muscleCode: 'GLUTES', adjustedVolumeKg: 800 },
        {
          muscleCode: 'LATS',
          adjustedVolumeKg: 400,
          families: [{ family: 'GUIDED', adjustedVolumeKg: 0 }],
        },
      ],
      previousWeeks: PREVIOUS,
    });
    expect(result.outputs.muscles.map((row) => [row.muscleCode, row.coefficients])).toEqual([
      ['CHEST', null],
      ['GLUTES', null],
      ['LATS', null],
      ['TRICEPS', null],
      ['QUADRICEPS', null],
    ]);
  });

  it('P-27.1 · solo informan: el estado y la recuperación estimada son los mismos con coeficientes o sin ellos', () => {
    const withFamilies = fatigue({
      muscles: [trained('CHEST', { LEG_HIP: 1100, FREE_TORSO: 600 })],
      previousWeeks: PREVIOUS,
    });
    // 1,700 sobre la base de 1,419 es +19.8 %: ámbar, con 60 h, con los coeficientes altos de pierna y cadera o sin ellos.
    const without = fatigue({ muscles: muscles({ CHEST: 1700 }), previousWeeks: PREVIOUS });
    const row = rowOf(withFamilies, 'CHEST');
    expect(row?.coefficients).not.toBeNull();
    expect(row).toMatchObject({ state: 'AMBER', recoveryHours: 60 });
    expect({ ...row, coefficients: null }).toEqual(rowOf(without, 'CHEST'));
  });

  it('una familia repetida o sin coeficientes, o un coeficiente o un volumen negativo, da NC-ENG-419', () => {
    const error = (input: FatigueCase) => {
      const run = runMethod(MUSCLE_FATIGUE_JV, {
        coefficients: COEFFICIENTS,
        ...input,
        thresholds: JV,
      });
      if (run.ok) return null;
      expect(run.errors.map((issue) => issue.rule)).toEqual(run.errors.map(() => 'RN-G18'));
      return run.errors.map((issue) => issue.code);
    };
    const chest = (families: MuscleVolume['families']): MuscleVolume[] => [
      { muscleCode: 'CHEST', adjustedVolumeKg: 1000, families },
    ];
    expect(
      error({
        muscles: chest([
          { family: 'GUIDED', adjustedVolumeKg: 500 },
          { family: 'GUIDED', adjustedVolumeKg: 500 },
        ]),
        previousWeeks: [],
      }),
    ).toEqual(['NC-ENG-419']);
    expect(
      error({ muscles: chest([{ family: 'GUIDED', adjustedVolumeKg: -1 }]), previousWeeks: [] }),
    ).toEqual(['NC-ENG-419']);
    expect(
      error({
        muscles: chest([{ family: 'GUIDED', adjustedVolumeKg: 500 }]),
        previousWeeks: [],
        coefficients: COEFFICIENTS.filter((row) => row.family !== 'GUIDED'),
      }),
    ).toEqual(['NC-ENG-419']);
    expect(
      error({ muscles: [], previousWeeks: [], coefficients: [...COEFFICIENTS, ...COEFFICIENTS] }),
    ).toEqual(['NC-ENG-419']);
    const [first, ...others] = COEFFICIENTS as [FamilyCoefficients, ...FamilyCoefficients[]];
    expect(
      error({
        muscles: [],
        previousWeeks: [],
        coefficients: [{ ...first, axialLoad: -0.1 }, ...others],
      }),
    ).toEqual(['NC-ENG-419']);
    expect(
      error({
        muscles: [],
        previousWeeks: [],
        coefficients: [{ ...first, family: 'OTRA' as FamilyCoefficients['family'] }, ...others],
      }),
    ).toEqual(['NC-ENG-419']);
  });
});

// P-27.2, respuesta de Rodrigo (2026-11-12): la familia de cada ejercicio sale de su patrón y su equipo. Los ejemplos son de la
// biblioteca base (seeds/exercise/ejercicios-base.csv).
describe('RN-G18 · P-27.2 · la familia de cada ejercicio, por patrón y equipo', () => {
  const family = (pattern: string | null, equipmentCode: string | null, modality = 'STRENGTH') =>
    fatigueFamilyOf({ pattern, equipmentCode, modality });

  it('los compuestos de pierna y cadera libres o con el peso corporal: sentadilla trasera, peso muerto, hip thrust, zancada', () => {
    expect(family('SQUAT', 'BARBELL')).toBe('LEG_HIP');
    expect(family('HINGE', 'KETTLEBELL')).toBe('LEG_HIP');
    expect(family('HIP_EXTENSION', 'BARBELL')).toBe('LEG_HIP');
    expect(family('UNILATERAL', 'BODYWEIGHT')).toBe('LEG_HIP');
    expect(family('UNILATERAL', 'BOX')).toBe('LEG_HIP');
  });

  it('la pliometría de esos patrones también: la sentadilla con salto es «pierna y cadera»', () => {
    expect(family('SQUAT', 'BODYWEIGHT', 'PLYOMETRIC')).toBe('LEG_HIP');
  });

  it('los empujes y tracciones libres son «torso libre»: press banca, dominada, remo con mancuerna', () => {
    expect(family('HORIZONTAL_PUSH', 'BARBELL')).toBe('FREE_TORSO');
    expect(family('VERTICAL_PULL', 'PULLUP_BAR')).toBe('FREE_TORSO');
    expect(family('HORIZONTAL_PULL', 'DUMBBELL')).toBe('FREE_TORSO');
    expect(family('VERTICAL_PUSH', 'BODYWEIGHT')).toBe('FREE_TORSO');
  });

  it('un patrón compuesto con máquina o polea es «guiados y poleas»: prensa, jalón al pecho, remo en polea', () => {
    expect(family('SQUAT', 'MACHINE')).toBe('GUIDED');
    expect(family('VERTICAL_PULL', 'CABLE')).toBe('GUIDED');
    expect(family('HORIZONTAL_PULL', 'CABLE')).toBe('GUIDED');
    expect(family('HIP_EXTENSION', 'MACHINE')).toBe('GUIDED');
  });

  it('la banda elástica y un ejercicio sin equipo cuentan como libres: el jalón con banda es «torso libre»', () => {
    expect(family('VERTICAL_PULL', 'BAND')).toBe('FREE_TORSO');
    expect(family('SQUAT', null)).toBe('LEG_HIP');
  });

  it('bíceps, tríceps, hombro, pantorrilla, rodilla y tronco son «aislamiento y brazos» con cualquier equipo', () => {
    expect(family('BICEPS', 'MACHINE')).toBe('ISOLATION');
    expect(family('TRICEPS', 'CABLE')).toBe('ISOLATION');
    expect(family('SHOULDER', 'DUMBBELL')).toBe('ISOLATION');
    expect(family('CALF', 'MACHINE')).toBe('ISOLATION');
    expect(family('KNEE_EXTENSION', 'MACHINE')).toBe('ISOLATION');
    expect(family('KNEE_FLEXION', 'BAND')).toBe('ISOLATION');
    expect(family('CORE_ANTI_EXTENSION', 'AB_WHEEL')).toBe('ISOLATION');
    expect(family('CORE_ANTI_ROTATION', 'CABLE')).toBe('ISOLATION');
    expect(family('LUMBAR_STABILITY', 'BODYWEIGHT')).toBe('ISOLATION');
    // Los saltos de tobillo: pliometría con patrón de pantorrilla.
    expect(family('CALF', 'BODYWEIGHT', 'PLYOMETRIC')).toBe('ISOLATION');
  });

  it('movilidad y cardio, por modalidad o por patrón, van con 0: bicicleta, rotación externa en polea, burpee', () => {
    expect(family('CONDITIONING', 'BIKE', 'CARDIO')).toBe('MOBILITY_CARDIO');
    expect(family('CONDITIONING', null, 'CARDIO')).toBe('MOBILITY_CARDIO');
    expect(family('SHOULDER_MOBILITY', 'CABLE', 'MOBILITY')).toBe('MOBILITY_CARDIO');
    expect(family('THORACIC_MOBILITY', 'FOAM_ROLLER', 'MOBILITY')).toBe('MOBILITY_CARDIO');
    expect(family('CONDITIONING', 'BODYWEIGHT', 'PLYOMETRIC')).toBe('MOBILITY_CARDIO');
    expect(family('HIP_EXTENSION', 'BAND', 'MOBILITY')).toBe('MOBILITY_CARDIO');
    expect(family(null, null, 'CARDIO')).toBe('MOBILITY_CARDIO');
  });

  it('cada uno de los 20 patrones tiene familia; un ejercicio sin patrón, o con uno que no existe, no', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      expect(FATIGUE_FAMILIES).toContain(family(pattern, 'DUMBBELL'));
    }
    expect(family(null, 'BARBELL')).toBeNull();
    expect(family('OTRO', 'BARBELL')).toBeNull();
  });
});
