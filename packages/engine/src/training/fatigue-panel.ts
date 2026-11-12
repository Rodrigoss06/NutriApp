import { defineMethod } from '../registry/run-method.js';
import { mean } from '../stats.js';

/** Verde, ámbar, rojo y «faltan datos» (P-23, P-24). */
export const FATIGUE_LIGHTS = ['GREEN', 'AMBER', 'RED', 'NO_DATA'] as const;
export type FatigueLight = (typeof FATIGUE_LIGHTS)[number];

/** La carga suma «sin base»: la semana tiene volumen, pero ninguna de las 3 previas lo tiene. */
export const LOAD_LIGHTS = [...FATIGUE_LIGHTS, 'NO_BASE'] as const;
export type LoadLight = (typeof LOAD_LIGHTS)[number];

/** Los umbrales del panel, como datos versionados (P-23, respuestas de Jeremy del 2026-11-09). */
export interface FatiguePanelThresholds {
  /** Recuperación roja con un estrés promedio de 4 o más… */
  readonly recoveryRedStressMin: number;
  /** …o un sueño promedio de menos de 6 h. */
  readonly recoveryRedSleepBelowHours: number;
  /** Ámbar con un estrés promedio de 3 o más… */
  readonly recoveryAmberStressMin: number;
  /** …o un sueño promedio de menos de 7 h. */
  readonly recoveryAmberSleepBelowHours: number;
  /** Fatiga percibida roja desde 4 y ámbar desde 3, de 1 a 5. */
  readonly fatigueRedMin: number;
  readonly fatigueAmberMin: number;
  /** Carga ámbar sobre +15 % del promedio de las 3 semanas previas y roja sobre +30 %. */
  readonly loadAmberAbovePct: number;
  readonly loadRedAbovePct: number;
}

/** Una semana del macrociclo: los promedios de su registro diario y su volumen ajustado (P-26). null es «sin dato», nunca cero. */
export interface FatiguePanelInput {
  /** De 1 a 5. */
  readonly avgStress: number | null;
  readonly avgSleepHours: number | null;
  /** La fatiga del registro diario, de 1 a 5. */
  readonly avgFatigue: number | null;
  /** La suma del volumen ajustado de la semana; 0 o null es una semana sin volumen. */
  readonly adjustedVolumeKg: number | null;
  /** El volumen ajustado de las semanas previas, hasta 3, de la más antigua a la más reciente. */
  readonly previousVolumesKg: readonly (number | null)[];
  readonly thresholds: FatiguePanelThresholds;
}

export interface FatiguePanelOutput {
  /** «Prom. 3 sem.»: el promedio de las previas que tienen volumen; null si ninguna (P-24). */
  readonly baseVolumeKg: number | null;
  /** (volumen − base) × 100 ÷ base, sin redondear (RN-D09); null sin volumen o sin base. */
  readonly loadChangePct: number | null;
  readonly load: LoadLight;
  readonly recovery: FatigueLight;
  readonly perceivedFatigue: FatigueLight;
  /** El peor de los tres; «sin base» no suma alerta y lo que no tiene datos no decide (P-24). */
  readonly overall: FatigueLight;
}

/** Las semanas que entran en la base (P-24, «Prom. 3 sem.»). */
const BASE_WEEKS = 3;

const SEVERITY: Readonly<Record<'GREEN' | 'AMBER' | 'RED', number>> = {
  GREEN: 0,
  AMBER: 1,
  RED: 2,
};

const hasVolume = (value: number | null): value is number => value !== null && value > 0;

const outside = (value: number | null, min: number, max: number): boolean =>
  value !== null && !(Number.isFinite(value) && value >= min && value <= max);

/**
 * La carga frente a su base (P-23): ámbar sobre +15 % y roja sobre +30 %. Sin volumen, «faltan datos»; sin base, «sin base».
 * La usa también la fatiga por grupo muscular (MUSCLE_FATIGUE_JV).
 */
export function loadLightOf(
  volume: number | null,
  base: number | null,
  thresholds: Pick<FatiguePanelThresholds, 'loadAmberAbovePct' | 'loadRedAbovePct'>,
): LoadLight {
  if (!hasVolume(volume)) return 'NO_DATA';
  if (base === null) return 'NO_BASE';
  // Sin dividir, para que +30 % exacto no caiga en rojo por el redondeo binario.
  const over = (volume - base) * 100;
  if (over > thresholds.loadRedAbovePct * base) return 'RED';
  if (over > thresholds.loadAmberAbovePct * base) return 'AMBER';
  return 'GREEN';
}

function recoveryOf(
  stress: number | null,
  sleep: number | null,
  thresholds: FatiguePanelThresholds,
): FatigueLight {
  if (stress === null && sleep === null) return 'NO_DATA';
  const stressAtLeast = (min: number) => stress !== null && stress >= min;
  const sleepBelow = (hours: number) => sleep !== null && sleep < hours;
  if (
    stressAtLeast(thresholds.recoveryRedStressMin) ||
    sleepBelow(thresholds.recoveryRedSleepBelowHours)
  ) {
    return 'RED';
  }
  if (
    stressAtLeast(thresholds.recoveryAmberStressMin) ||
    sleepBelow(thresholds.recoveryAmberSleepBelowHours)
  ) {
    return 'AMBER';
  }
  return 'GREEN';
}

function fatigueOf(fatigue: number | null, thresholds: FatiguePanelThresholds): FatigueLight {
  if (fatigue === null) return 'NO_DATA';
  if (fatigue >= thresholds.fatigueRedMin) return 'RED';
  if (fatigue >= thresholds.fatigueAmberMin) return 'AMBER';
  return 'GREEN';
}

function worstOf(lights: readonly LoadLight[]): FatigueLight {
  const known = lights.filter(
    (light): light is 'GREEN' | 'AMBER' | 'RED' => light !== 'NO_DATA' && light !== 'NO_BASE',
  );
  if (known.length === 0) return 'NO_DATA';
  return known.reduce((worst, light) => (SEVERITY[light] > SEVERITY[worst] ? light : worst));
}

const crossed = (t: FatiguePanelThresholds): boolean =>
  Object.values(t).some((value) => !Number.isFinite(value) || value < 0) ||
  t.recoveryAmberStressMin > t.recoveryRedStressMin ||
  t.recoveryRedSleepBelowHours > t.recoveryAmberSleepBelowHours ||
  t.fatigueAmberMin > t.fatigueRedMin ||
  t.loadAmberAbovePct > t.loadRedAbovePct;

/**
 * El panel de fatiga y recuperación de la hoja piloto de JV Fitness (P14.5, PR 3; P-23 y P-24, respuestas de Jeremy del
 * 2026-11-09), para una semana del macrociclo:
 * - recuperación: roja con estrés de 4 o más o sueño de menos de 6 h; ámbar con estrés de 3 o más o sueño de menos de 7 h;
 * - carga: el volumen ajustado de la semana frente al promedio de las 3 previas que tienen volumen; ámbar sobre +15 % y roja
 *   sobre +30 %; sin previas, «sin base»;
 * - fatiga percibida: ámbar desde 3 y roja desde 4;
 * - estado general: el peor de los tres.
 * Los promedios se comparan sin redondear: 2.6 de estrés es verde. Solo informa: decide el control semanal (P-25).
 */
export const FATIGUE_PANEL_JV = defineMethod<FatiguePanelInput, FatiguePanelOutput>({
  code: 'FATIGUE_PANEL_JV',
  version: '1.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['previousVolumesKg', 'thresholds'],
  requiredSites: [],
  citation:
    'Hoja piloto de JV Fitness, panel de fatiga y recuperación (P-23 y P-24, respuestas de Jeremy del 2026-11-09)',
  validity: [
    {
      rule: 'RN-G16',
      severity: 'ERROR',
      code: 'NC-ENG-413',
      message:
        'El estrés y la fatiga van de 1 a 5, el sueño de 0 a 24 h, los volúmenes no son negativos y la base usa hasta 3 semanas.',
      when: (input) =>
        outside(input.avgStress, 1, 5) ||
        outside(input.avgFatigue, 1, 5) ||
        outside(input.avgSleepHours, 0, 24) ||
        outside(input.adjustedVolumeKg, 0, Infinity) ||
        input.previousVolumesKg.some((volume) => outside(volume, 0, Infinity)) ||
        input.previousVolumesKg.length > BASE_WEEKS,
    },
    {
      rule: 'RN-G16',
      severity: 'ERROR',
      code: 'NC-ENG-414',
      message: 'Los umbrales no son negativos y el ámbar llega antes que el rojo.',
      when: ({ thresholds }) => crossed(thresholds),
    },
  ],
  compute: (input) => {
    const previous = input.previousVolumesKg.filter(hasVolume);
    const baseVolumeKg = previous.length === 0 ? null : mean(previous);
    const load = loadLightOf(input.adjustedVolumeKg, baseVolumeKg, input.thresholds);
    const recovery = recoveryOf(input.avgStress, input.avgSleepHours, input.thresholds);
    const perceivedFatigue = fatigueOf(input.avgFatigue, input.thresholds);
    return {
      outputs: {
        baseVolumeKg,
        loadChangePct:
          baseVolumeKg === null || !hasVolume(input.adjustedVolumeKg)
            ? null
            : ((input.adjustedVolumeKg - baseVolumeKg) * 100) / baseVolumeKg,
        load,
        recovery,
        perceivedFatigue,
        overall: worstOf([load, recovery, perceivedFatigue]),
      },
    };
  },
});
