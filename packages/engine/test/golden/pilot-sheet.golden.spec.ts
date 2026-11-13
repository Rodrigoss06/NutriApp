import { describe, expect, it } from 'vitest';
import { MACROS_DAY_PROFILE } from '../../src/diet/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import {
  ADJUSTED_VOLUME,
  FATIGUE_PANEL_JV,
  MESOCYCLE_REPORT_JV,
  type AdjustedVolumeSet,
  type FatiguePanelThresholds,
  type MesocycleExerciseOneRm,
  type MesocycleReportWeek,
  type VolumeFactorTables,
} from '../../src/training/index.js';
import { expectKcal, expectOk } from '../support.js';

/**
 * G-41 a G-44 reproducen la hoja piloto de JV Fitness (Notion 03 y 07): Mateo Prueba, el alumno sintético de la hoja, con las
 * respuestas de Jeremy a P-20 y de P-23 a P-26, y las de Rodrigo a P-28 y P-29. Los porcentajes se comparan con el decimal que
 * muestra la hoja; el motor no redondea (RN-D09).
 */

describe('G-41 · RN-E07 · perfiles de día de Mateo', () => {
  const profile = (choG: number) =>
    expectOk(runMethod(MACROS_DAY_PROFILE, { choG, proteinG: 160, fatG: 70 })).outputs;

  it('240, 160 y 70 g dan 2,230 kcal (Descanso); 310, 160 y 70 g, 2,510 kcal (Entrenamiento)', () => {
    expectKcal(profile(240).kcal, 2230);
    expectKcal(profile(310).kcal, 2510);
  });
});

// P-26, respuesta de Jeremy (2026-11-10): el factor de RIR 0 a 5 o más y el del descanso de 45 s a 180 s o más.
const JV_VOLUME_FACTORS: VolumeFactorTables = {
  rir: [
    { from: 0, factor: 1.3, orMore: false },
    { from: 1, factor: 1.2, orMore: false },
    { from: 2, factor: 1.1, orMore: false },
    { from: 3, factor: 1.0, orMore: false },
    { from: 4, factor: 0.9, orMore: false },
    { from: 5, factor: 0.8, orMore: true },
  ],
  rest: [
    { from: 45, factor: 1.15, orMore: false },
    { from: 60, factor: 1.1, orMore: false },
    { from: 75, factor: 1.05, orMore: false },
    { from: 90, factor: 1.0, orMore: false },
    { from: 120, factor: 1.0, orMore: false },
    { from: 180, factor: 0.95, orMore: true },
  ],
};

describe('G-42 · RN-F18 · volumen ajustado', () => {
  it('3 × 12 × 45 kg con RIR 2 y 120 s: volumen 1,620; factores 1.1 y 1.00; volumen ajustado 1,782', () => {
    const set = (id: string): AdjustedVolumeSet => ({
      id,
      reps: 12,
      loadKg: 45,
      rir: 2,
      rpe: null,
      restSeconds: 120,
    });
    const { outputs } = expectOk(
      runMethod(ADJUSTED_VOLUME, {
        sets: [set('1'), set('2'), set('3')],
        factors: JV_VOLUME_FACTORS,
      }),
    );
    expect(outputs.volumeKg).toBe(1620);
    expect(outputs.sets.map((row) => [row.rirFactor, row.restFactor])).toEqual([
      [1.1, 1],
      [1.1, 1],
      [1.1, 1],
    ]);
    expect(outputs.adjustedVolumeKg).toBeCloseTo(1782, 9);
    expect(outputs.unfactoredSets).toBe(0);
  });
});

// P-23 y P-24, respuestas de Jeremy (2026-11-09).
const JV_PANEL: FatiguePanelThresholds = {
  recoveryRedStressMin: 4,
  recoveryRedSleepBelowHours: 6,
  recoveryAmberStressMin: 3,
  recoveryAmberSleepBelowHours: 7,
  fatigueRedMin: 4,
  fatigueAmberMin: 3,
  loadAmberAbovePct: 15,
  loadRedAbovePct: 30,
};

// Las semanas 1 a 6 del macrociclo de Mateo; la 5 y la 6 no tienen registros.
const MATEO_WEEKS = [
  { avgStress: 3, avgSleepHours: 6.4, avgFatigue: 3, adjustedVolumeKg: 5220 },
  { avgStress: 4, avgSleepHours: 6.8, avgFatigue: 4, adjustedVolumeKg: 5490 },
  { avgStress: 3, avgSleepHours: 7.1, avgFatigue: 3, adjustedVolumeKg: 6336 },
  { avgStress: 2, avgSleepHours: 7.4, avgFatigue: 2, adjustedVolumeKg: 3375 },
  { avgStress: null, avgSleepHours: null, avgFatigue: null, adjustedVolumeKg: null },
  { avgStress: null, avgSleepHours: null, avgFatigue: null, adjustedVolumeKg: null },
] as const;

describe('G-43 · RN-G18 · panel de fatiga y recuperación de Mateo', () => {
  it('estado general ámbar, rojo, ámbar, verde y faltan datos; «Prom. 3 sem.» de la 2 a la 6: 5,220, 5,355, 5,682, 5,067 y 4,855.5', () => {
    const rows = MATEO_WEEKS.map(
      (week, index) =>
        expectOk(
          runMethod(FATIGUE_PANEL_JV, {
            ...week,
            previousVolumesKg: MATEO_WEEKS.slice(Math.max(0, index - 3), index).map(
              (previous) => previous.adjustedVolumeKg,
            ),
            thresholds: JV_PANEL,
          }),
        ).outputs,
    );
    expect(rows.slice(0, 5).map((row) => row.overall)).toEqual([
      'AMBER',
      'RED',
      'AMBER',
      'GREEN',
      'NO_DATA',
    ]);
    expect(rows.slice(1).map((row) => row.baseVolumeKg)).toEqual([5220, 5355, 5682, 5067, 4855.5]);
  });
});

// El mesociclo de Mateo, del 06/10 al 02/11: series planificadas de la rutina completa y series hechas (P-29), 3 sesiones por
// semana y los promedios de su control semanal (el estrés y la fatiga coinciden cada semana).
const mesocycleWeek = (
  weekNo: number,
  [weekStart, weekEnd]: readonly [string, string],
  [plannedSets, doneSets]: readonly [number, number],
  [sleepHours, stressAndFatigue, performancePct, nutritionPct]: readonly [
    number,
    number,
    number,
    number,
  ],
): MesocycleReportWeek => ({
  weekNo,
  weekStart,
  weekEnd,
  plannedSets,
  doneSets,
  sessionsPlanned: 3,
  sessionsDone: 3,
  sleepHours,
  stress: stressAndFatigue,
  fatigue: stressAndFatigue,
  performancePct,
  nutritionPct,
});

const MESOCYCLE_WEEKS = [
  mesocycleWeek(1, ['2026-10-06', '2026-10-12'], [60, 56], [6.4, 3, 80, 78]),
  mesocycleWeek(2, ['2026-10-13', '2026-10-19'], [64, 60], [6.8, 4, 80, 82]),
  mesocycleWeek(3, ['2026-10-20', '2026-10-26'], [68, 61], [7.1, 3, 100, 88]),
  mesocycleWeek(4, ['2026-10-27', '2026-11-02'], [48, 46], [7.4, 2, 100, 92]),
];

// El 1RM con Epley de lo que registró Mateo cada semana: 12 repeticiones y 10 en la descarga de la semana 4 (P-28).
const oneRms = (
  exerciseId: string,
  days: readonly (readonly [string, number])[],
): MesocycleExerciseOneRm => ({
  exerciseId,
  bestBeforeKg: null,
  days: days.map(([localDate, estimated1rmKg]) => ({ localDate, estimated1rmKg })),
});

const MESOCYCLE_ONE_RMS = [
  oneRms('press-banca', [
    ['2026-10-06', 56],
    ['2026-10-13', 59.5],
    ['2026-10-20', 63],
    ['2026-10-27', 35 * (1 + 10 / 30)],
  ]),
  oneRms('sentadilla', [
    ['2026-10-08', 84],
    ['2026-10-15', 87.5],
    ['2026-10-22', 91],
    ['2026-10-29', 50 * (1 + 10 / 30)],
  ]),
  oneRms('jalon', [
    ['2026-10-10', 63],
    ['2026-10-17', 66.5],
    ['2026-10-24', 70],
    ['2026-10-31', 40 * (1 + 10 / 30)],
  ]),
];

describe('G-44 · RN-G19 · el mes de Mateo', () => {
  it('240 series planificadas y 223 hechas: volumen cumplido 92.9 % (semana 1: 93.3 %); récords 0, 3, 3 y 0', () => {
    const { outputs } = expectOk(
      runMethod(MESOCYCLE_REPORT_JV, {
        weeks: MESOCYCLE_WEEKS,
        oneRmFormula: 'ONERM_EPLEY1985',
        exercises: MESOCYCLE_ONE_RMS,
      }),
    );
    expect(outputs.total).toMatchObject({ plannedSets: 240, doneSets: 223 });
    expect(outputs.total.volumePct).toBeCloseTo(92.9, 1);
    expect(outputs.weeks[0]?.volumePct).toBeCloseTo(93.3, 1);
    expect(outputs.weeks.map((week) => week.records)).toEqual([0, 3, 3, 0]);
  });
});
