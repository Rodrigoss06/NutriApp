import { defineMethod } from '../registry/run-method.js';
import { loadLightOf, type LoadLight } from './fatigue-panel.js';
import type { MovementPattern } from './routine-proposal.js';

/**
 * Las familias de ejercicio de la hoja piloto (P-27, respuesta de Jeremy del 2026-11-10): compuestos de pierna y cadera, compuestos
 * libres de torso, compuestos guiados y poleas, aislamiento y brazos, y movilidad y cardio.
 */
export const FATIGUE_FAMILIES = [
  'LEG_HIP',
  'FREE_TORSO',
  'GUIDED',
  'ISOLATION',
  'MOBILITY_CARDIO',
] as const;
export type FatigueFamily = (typeof FATIGUE_FAMILIES)[number];

/** Lo que decide la familia de un ejercicio (P-27.2): su patrón, su equipo y su modalidad, con los códigos de la biblioteca. */
export interface FatigueFamilyTraits {
  readonly pattern: string | null;
  readonly equipmentCode: string | null;
  readonly modality: string;
}

const MOBILITY_CARDIO_MODALITIES: ReadonlySet<string> = new Set(['CARDIO', 'MOBILITY']);
const MOBILITY_CARDIO_PATTERNS: ReadonlySet<string> = new Set<MovementPattern>([
  'CONDITIONING',
  'SHOULDER_MOBILITY',
  'THORACIC_MOBILITY',
]);
const ISOLATION_PATTERNS: ReadonlySet<string> = new Set<MovementPattern>([
  'BICEPS',
  'TRICEPS',
  'SHOULDER',
  'CALF',
  'KNEE_EXTENSION',
  'KNEE_FLEXION',
  'CORE_ANTI_EXTENSION',
  'CORE_ANTI_ROTATION',
  'LUMBAR_STABILITY',
]);
const LEG_HIP_PATTERNS: ReadonlySet<string> = new Set<MovementPattern>([
  'SQUAT',
  'HINGE',
  'HIP_EXTENSION',
  'UNILATERAL',
]);
const TORSO_PATTERNS: ReadonlySet<string> = new Set<MovementPattern>([
  'HORIZONTAL_PUSH',
  'VERTICAL_PUSH',
  'HORIZONTAL_PULL',
  'VERTICAL_PULL',
]);
const GUIDED_EQUIPMENT: ReadonlySet<string> = new Set(['MACHINE', 'CABLE']);

/**
 * La familia de un ejercicio por su patrón y su equipo (P-27.2, respuesta de Rodrigo del 2026-11-12), en este orden:
 * 1. «movilidad y cardio»: la modalidad de cardio o de movilidad, o un patrón de acondicionamiento o de movilidad;
 * 2. «aislamiento y brazos»: bíceps, tríceps, hombro, pantorrilla, extensión y flexión de rodilla y tronco, con cualquier equipo;
 * 3. «guiados y poleas»: un patrón compuesto con máquina o polea;
 * 4. «pierna y cadera» (sentadilla, bisagra, extensión de cadera y unilateral) o «torso libre» (empujes y tracciones) con otro
 *    equipo, sin equipo o con el peso corporal, también su pliometría.
 * Sin patrón, o con uno que no está aquí, no tiene familia (null). Es parte de `MUSCLE_FATIGUE_JV` 1.1.0: cambiarla sube su versión.
 */
export function fatigueFamilyOf({
  pattern,
  equipmentCode,
  modality,
}: FatigueFamilyTraits): FatigueFamily | null {
  if (
    MOBILITY_CARDIO_MODALITIES.has(modality) ||
    (pattern !== null && MOBILITY_CARDIO_PATTERNS.has(pattern))
  ) {
    return 'MOBILITY_CARDIO';
  }
  if (pattern === null) return null;
  if (ISOLATION_PATTERNS.has(pattern)) return 'ISOLATION';
  const legHip = LEG_HIP_PATTERNS.has(pattern);
  if (!legHip && !TORSO_PATTERNS.has(pattern)) return null;
  if (equipmentCode !== null && GUIDED_EQUIPMENT.has(equipmentCode)) return 'GUIDED';
  return legHip ? 'LEG_HIP' : 'FREE_TORSO';
}

/** Los cuatro coeficientes de la hoja piloto (P-27): fatiga muscular, fatiga neural, carga axial y demanda técnica. */
export interface FatigueCoefficients {
  readonly muscularFatigue: number;
  readonly neuralFatigue: number;
  readonly axialLoad: number;
  readonly technicalDemand: number;
}

/** Los coeficientes de una familia, como datos versionados (P-27, respuesta de Jeremy del 2026-11-10). */
export interface FamilyCoefficients extends FatigueCoefficients {
  readonly family: FatigueFamily;
}

/** El volumen ajustado que los ejercicios de una familia le dieron al grupo en la semana, con 1.0 y 0.5 (P-27.2). */
export interface FamilyVolume {
  readonly family: FatigueFamily;
  readonly adjustedVolumeKg: number;
}

/** El volumen ajustado de un grupo muscular en una semana: principal al 100 % y secundario al 50 % (P-27, ADR-106). */
export interface MuscleVolume {
  readonly muscleCode: string;
  /** null o 0 es «no se entrenó». */
  readonly adjustedVolumeKg: number | null;
  /** El mismo volumen repartido por familia de ejercicio: pesa los coeficientes (P-27.1). Sin familias, no hay coeficientes. */
  readonly families?: readonly FamilyVolume[];
}

/** Una semana previa: su volumen ajustado total decide si entra en la base (P-24), y sus grupos dan la base de cada uno. */
export interface MuscleFatigueWeek {
  readonly adjustedVolumeKg: number | null;
  readonly muscles: readonly MuscleVolume[];
}

/** Los umbrales, como datos versionados (P-23 y P-27, respuestas de Jeremy del 2026-11-09 y 2026-11-10). */
export interface MuscleFatigueThresholds {
  /** Ámbar sobre +15 % de la base y rojo sobre +30 %, como la carga del panel. */
  readonly loadAmberAbovePct: number;
  readonly loadRedAbovePct: number;
  /** «Recuperación est.»: 48 h en verde, 60 h en ámbar y 72 h en rojo. */
  readonly recoveryGreenHours: number;
  readonly recoveryAmberHours: number;
  readonly recoveryRedHours: number;
}

export interface MuscleFatigueInput {
  /** Los grupos de la semana. */
  readonly muscles: readonly MuscleVolume[];
  /** Las semanas previas, hasta 3, de la más antigua a la más reciente. */
  readonly previousWeeks: readonly MuscleFatigueWeek[];
  readonly thresholds: MuscleFatigueThresholds;
  /** Los coeficientes de cada familia vigentes al empezar la semana (P-27.1). */
  readonly coefficients: readonly FamilyCoefficients[];
}

export interface MuscleFatigueRow {
  readonly muscleCode: string;
  /** «Fatiga entrenamiento»: el volumen ajustado del grupo en la semana; null si no se entrenó. */
  readonly trainingFatigueKg: number | null;
  /** «Base 3 sem.»: el promedio del grupo en las previas con volumen, con 0 donde no se entrenó; null sin previas. */
  readonly baseVolumeKg: number | null;
  /** (fatiga − base) × 100 ÷ base, sin redondear (RN-D09); null sin volumen o sin base. */
  readonly changePct: number | null;
  /** Sin volumen, «faltan datos»; con base nula o en 0, «sin base». */
  readonly state: LoadLight;
  /** Las horas del color; null con «faltan datos» o «sin base». */
  readonly recoveryHours: number | null;
  /**
   * Los coeficientes de las familias que trabajaron el grupo, promediados según el volumen que le dio cada una (P-27.1), sin
   * redondear (RN-D09). null si no se entrenó o si su volumen no trae familias. Solo informan: no cambian el estado ni las horas.
   */
  readonly coefficients: FatigueCoefficients | null;
}

export interface MuscleFatigueOutput {
  /** Primero los grupos de la semana, en su orden; después los que solo están en la base. */
  readonly muscles: readonly MuscleFatigueRow[];
  /** Cuántas semanas previas entraron en la base (P-24). */
  readonly baseWeeks: number;
}

/** Las semanas que entran en la base (P-24, «Base 3 sem.»). */
const BASE_WEEKS = 3;

const trained = (value: number | null): value is number => value !== null && value > 0;

const negative = (value: number | null): boolean =>
  value !== null && !(Number.isFinite(value) && value >= 0);

const repeated = (muscles: readonly MuscleVolume[]): boolean =>
  new Set(muscles.map((muscle) => muscle.muscleCode)).size !== muscles.length;

const crossed = (t: MuscleFatigueThresholds): boolean =>
  Object.values(t).some((value) => !Number.isFinite(value) || value < 0) ||
  t.loadAmberAbovePct > t.loadRedAbovePct ||
  t.recoveryGreenHours > t.recoveryAmberHours ||
  t.recoveryAmberHours > t.recoveryRedHours;

const COEFFICIENT_KEYS = [
  'muscularFatigue',
  'neuralFatigue',
  'axialLoad',
  'technicalDemand',
] as const satisfies readonly (keyof FatigueCoefficients)[];

const FAMILY_CODES: ReadonlySet<string> = new Set(FATIGUE_FAMILIES);

/** Una tabla con una familia que no existe o repetida, o con un coeficiente negativo o que no es un número. */
const badTable = (table: readonly FamilyCoefficients[]): boolean =>
  new Set(table.map((row) => row.family)).size !== table.length ||
  table.some(
    (row) =>
      !FAMILY_CODES.has(row.family) ||
      COEFFICIENT_KEYS.some((key) => !(Number.isFinite(row[key]) && row[key] >= 0)),
  );

/** Un grupo con una familia repetida, con volumen negativo o sin coeficientes en la tabla. */
const badFamilies = (muscles: readonly MuscleVolume[], table: readonly FamilyCoefficients[]) => {
  const known = new Set(table.map((row) => row.family));
  return muscles.some((muscle) => {
    const families = muscle.families ?? [];
    return (
      new Set(families.map((item) => item.family)).size !== families.length ||
      families.some(
        (item) =>
          !known.has(item.family) ||
          !(Number.isFinite(item.adjustedVolumeKg) && item.adjustedVolumeKg >= 0),
      )
    );
  });
};

/** El promedio de cada coeficiente, pesado por el volumen de cada familia; sin volumen, null. */
function coefficientsOf(
  families: readonly FamilyVolume[],
  table: readonly FamilyCoefficients[],
): FatigueCoefficients | null {
  const weighted = families.flatMap((item) => {
    const row = table.find((candidate) => candidate.family === item.family);
    return row && item.adjustedVolumeKg > 0 ? [{ row, volume: item.adjustedVolumeKg }] : [];
  });
  const total = weighted.reduce((sum, item) => sum + item.volume, 0);
  if (total === 0) return null;
  const average = (key: keyof FatigueCoefficients): number =>
    weighted.reduce((sum, item) => sum + item.volume * item.row[key], 0) / total;
  return {
    muscularFatigue: average('muscularFatigue'),
    neuralFatigue: average('neuralFatigue'),
    axialLoad: average('axialLoad'),
    technicalDemand: average('technicalDemand'),
  };
}

function recoveryOf(state: LoadLight, t: MuscleFatigueThresholds): number | null {
  if (state === 'GREEN') return t.recoveryGreenHours;
  if (state === 'AMBER') return t.recoveryAmberHours;
  if (state === 'RED') return t.recoveryRedHours;
  return null;
}

/**
 * La fatiga por grupo muscular de la hoja piloto de JV Fitness (P14.5, PR 4; P-27, respuesta de Jeremy del 2026-11-10 y decisiones
 * de Rodrigo del 2026-11-11), para una semana del macrociclo:
 * - «Fatiga entrenamiento»: el volumen ajustado del grupo, con 1.0 para el músculo principal y 0.5 para el secundario;
 * - «Base 3 sem.»: su promedio en las mismas semanas previas que la carga del panel (las que tienen volumen, P-24). Una de esas
 *   semanas en la que el grupo no se entrenó cuenta como 0;
 * - «Estado»: ámbar sobre +15 % y rojo sobre +30 % de la base (P-23);
 * - «Recuperación est.»: 48 h en verde, 60 h en ámbar y 72 h en rojo;
 * - 1.1.0 (P-27.1 y P-27.2, respuestas de Rodrigo del 2026-11-12): fatiga muscular, fatiga neural, carga axial y demanda técnica
 *   del grupo, el coeficiente de cada familia de ejercicio (`fatigueFamilyOf`) promediado según el volumen que le dio. Solo
 *   informan: no cambian el estado ni la recuperación.
 * Solo informa: decide el control semanal (P-25).
 */
export const MUSCLE_FATIGUE_JV = defineMethod<MuscleFatigueInput, MuscleFatigueOutput>({
  code: 'MUSCLE_FATIGUE_JV',
  version: '1.1.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['muscles', 'previousWeeks', 'thresholds', 'coefficients'],
  requiredSites: [],
  citation:
    'Hoja piloto de JV Fitness, fatiga por grupo muscular (P-27, respuesta de Jeremy del 2026-11-10; P-27.1 y P-27.2, respuestas de Rodrigo del 2026-11-12)',
  validity: [
    {
      rule: 'RN-G18',
      severity: 'ERROR',
      code: 'NC-ENG-415',
      message:
        'Los volúmenes no son negativos, cada grupo va una vez por semana y la base usa hasta 3 semanas.',
      when: (input) =>
        input.previousWeeks.length > BASE_WEEKS ||
        [input.muscles, ...input.previousWeeks.map((week) => week.muscles)].some(
          (muscles) =>
            repeated(muscles) || muscles.some((muscle) => negative(muscle.adjustedVolumeKg)),
        ) ||
        input.previousWeeks.some((week) => negative(week.adjustedVolumeKg)),
    },
    {
      rule: 'RN-G18',
      severity: 'ERROR',
      code: 'NC-ENG-416',
      message:
        'Los umbrales no son negativos, el ámbar llega antes que el rojo y las horas de recuperación crecen con el color.',
      when: ({ thresholds }) => crossed(thresholds),
    },
    {
      rule: 'RN-G18',
      severity: 'ERROR',
      code: 'NC-ENG-419',
      message:
        'Cada familia va una vez en la tabla, con coeficientes no negativos, y cada grupo trae sus familias una vez, sin volumen negativo y con coeficientes.',
      when: ({ muscles, coefficients }) =>
        badTable(coefficients) || badFamilies(muscles, coefficients),
    },
  ],
  compute: ({ muscles, previousWeeks, thresholds, coefficients }) => {
    const baseWeeks = previousWeeks.filter((week) => trained(week.adjustedVolumeKg));
    const codes = [
      ...new Set([
        ...muscles.map((muscle) => muscle.muscleCode),
        ...baseWeeks.flatMap((week) =>
          week.muscles
            .filter((muscle) => trained(muscle.adjustedVolumeKg))
            .map((muscle) => muscle.muscleCode),
        ),
      ]),
    ];
    const volumeIn = (week: { readonly muscles: readonly MuscleVolume[] }, code: string) =>
      week.muscles.find((muscle) => muscle.muscleCode === code)?.adjustedVolumeKg ?? null;
    const rows = codes.map((muscleCode): MuscleFatigueRow => {
      const current = volumeIn({ muscles }, muscleCode);
      const trainingFatigueKg = trained(current) ? current : null;
      const families = muscles.find((muscle) => muscle.muscleCode === muscleCode)?.families ?? [];
      const baseVolumeKg =
        baseWeeks.length === 0
          ? null
          : baseWeeks.reduce((total, week) => total + (volumeIn(week, muscleCode) ?? 0), 0) /
            baseWeeks.length;
      // Una base en 0 no es una base: cualquier volumen sería un aumento infinito.
      const base = baseVolumeKg === 0 ? null : baseVolumeKg;
      const state = loadLightOf(trainingFatigueKg, base, thresholds);
      return {
        muscleCode,
        trainingFatigueKg,
        baseVolumeKg,
        changePct:
          base === null || trainingFatigueKg === null
            ? null
            : ((trainingFatigueKg - base) * 100) / base,
        state,
        recoveryHours: recoveryOf(state, thresholds),
        coefficients: trainingFatigueKg === null ? null : coefficientsOf(families, coefficients),
      };
    });
    return { outputs: { muscles: rows, baseWeeks: baseWeeks.length } };
  },
});
