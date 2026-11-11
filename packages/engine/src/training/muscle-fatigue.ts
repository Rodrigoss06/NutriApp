import { defineMethod } from '../registry/run-method.js';
import { loadLightOf, type LoadLight } from './fatigue-panel.js';

/** El volumen ajustado de un grupo muscular en una semana: principal al 100 % y secundario al 50 % (P-27, ADR-106). */
export interface MuscleVolume {
  readonly muscleCode: string;
  /** null o 0 es «no se entrenó». */
  readonly adjustedVolumeKg: number | null;
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
 * - «Recuperación est.»: 48 h en verde, 60 h en ámbar y 72 h en rojo.
 * Los coeficientes por familia de ejercicio (fatiga muscular y neural, carga axial y demanda técnica) no entran: falta saber cómo
 * se reparten por grupo. Solo informa: decide el control semanal (P-25).
 */
export const MUSCLE_FATIGUE_JV = defineMethod<MuscleFatigueInput, MuscleFatigueOutput>({
  code: 'MUSCLE_FATIGUE_JV',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['muscles', 'previousWeeks', 'thresholds'],
  requiredSites: [],
  citation:
    'Hoja piloto de JV Fitness, fatiga por grupo muscular (P-27, respuesta de Jeremy del 2026-11-10)',
  validity: [
    {
      rule: 'RN-G16',
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
      rule: 'RN-G16',
      severity: 'ERROR',
      code: 'NC-ENG-416',
      message:
        'Los umbrales no son negativos, el ámbar llega antes que el rojo y las horas de recuperación crecen con el color.',
      when: ({ thresholds }) => crossed(thresholds),
    },
  ],
  compute: ({ muscles, previousWeeks, thresholds }) => {
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
      };
    });
    return { outputs: { muscles: rows, baseWeeks: baseWeeks.length } };
  },
});
