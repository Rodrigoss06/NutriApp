import { describe, expect, it } from 'vitest';
import { runMethod } from '../registry/run-method.js';
import {
  FATIGUE_PANEL_JV,
  type FatiguePanelInput,
  type FatiguePanelThresholds,
} from './fatigue-panel.js';

// P-23 y P-24, respuestas de Jeremy (2026-11-09): rojo con estrés 4 o sueño de menos de 6 h; ámbar con estrés 3 o sueño de 6.0 a
// menos de 7.0 h; fatiga 3 ámbar y 4 roja; carga ámbar sobre +15 % y roja sobre +30 % del promedio de las 3 semanas previas.
const JV: FatiguePanelThresholds = {
  recoveryRedStressMin: 4,
  recoveryRedSleepBelowHours: 6,
  recoveryAmberStressMin: 3,
  recoveryAmberSleepBelowHours: 7,
  fatigueRedMin: 4,
  fatigueAmberMin: 3,
  loadAmberAbovePct: 15,
  loadRedAbovePct: 30,
};

const week = (overrides: Partial<FatiguePanelInput> = {}): FatiguePanelInput => ({
  avgStress: 2,
  avgSleepHours: 7.5,
  avgFatigue: 2,
  adjustedVolumeKg: 5000,
  previousVolumesKg: [5000, 5000, 5000],
  thresholds: JV,
  ...overrides,
});

const panel = (input: FatiguePanelInput) => {
  const run = runMethod(FATIGUE_PANEL_JV, input);
  if (!run.ok) throw new Error(JSON.stringify(run.errors));
  return run.result.outputs;
};

// El panel de la hoja piloto: Mateo Prueba, semanas 1 a 6 de octubre y noviembre de 2026. La semana 3 lleva la sentadilla del
// 22/10 (P-33: ese día asistió), y la 5 y la 6 no tienen registros.
const MATEO = [
  { avgStress: 3, avgSleepHours: 6.4, avgFatigue: 3, adjustedVolumeKg: 5220 },
  { avgStress: 4, avgSleepHours: 6.8, avgFatigue: 4, adjustedVolumeKg: 5490 },
  { avgStress: 3, avgSleepHours: 7.1, avgFatigue: 3, adjustedVolumeKg: 6336 },
  { avgStress: 2, avgSleepHours: 7.4, avgFatigue: 2, adjustedVolumeKg: 3375 },
  { avgStress: null, avgSleepHours: null, avgFatigue: null, adjustedVolumeKg: null },
  { avgStress: null, avgSleepHours: null, avgFatigue: null, adjustedVolumeKg: null },
] as const;

const mateoWeek = (index: number): FatiguePanelInput => ({
  ...(MATEO[index] as (typeof MATEO)[number]),
  previousVolumesKg: MATEO.slice(Math.max(0, index - 3), index).map(
    (previous) => previous.adjustedVolumeKg,
  ),
  thresholds: JV,
});

describe('RN-G16 · P-23 y P-24 · panel de fatiga y recuperación de la hoja piloto', () => {
  it('reproduce las semanas de Mateo: ámbar, rojo, ámbar, verde y luego faltan datos', () => {
    const rows = MATEO.map((_, index) => panel(mateoWeek(index)));
    expect(rows.map((row) => row.load)).toEqual([
      'NO_BASE',
      'GREEN',
      'AMBER',
      'GREEN',
      'NO_DATA',
      'NO_DATA',
    ]);
    expect(rows.map((row) => row.recovery)).toEqual([
      'AMBER',
      'RED',
      'AMBER',
      'GREEN',
      'NO_DATA',
      'NO_DATA',
    ]);
    expect(rows.map((row) => row.perceivedFatigue)).toEqual([
      'AMBER',
      'RED',
      'AMBER',
      'GREEN',
      'NO_DATA',
      'NO_DATA',
    ]);
    expect(rows.map((row) => row.overall)).toEqual([
      'AMBER',
      'RED',
      'AMBER',
      'GREEN',
      'NO_DATA',
      'NO_DATA',
    ]);
    // «Prom. 3 sem.» de la hoja: 5,220; 5,355; 5,682; 5,067 y 4,855.5, sin las semanas vacías en la suma ni en el divisor.
    expect(rows.map((row) => row.baseVolumeKg)).toEqual([null, 5220, 5355, 5682, 5067, 4855.5]);
    expect(rows[2]?.loadChangePct).toBeCloseTo(18.32, 2);
    expect(rows[1]?.loadChangePct).toBeCloseTo(5.17, 2);
  });

  it('la carga es verde hasta +15 %, ámbar sobre +15 % y hasta +30 %, y roja sobre +30 %', () => {
    const load = (adjustedVolumeKg: number) => panel(week({ adjustedVolumeKg })).load;
    expect(load(5750)).toBe('GREEN');
    expect(load(5751)).toBe('AMBER');
    expect(load(6500)).toBe('AMBER');
    expect(load(6501)).toBe('RED');
    expect(load(2000)).toBe('GREEN');
  });

  it('la recuperación usa los promedios sin redondear: estrés de 3 a menos de 4 es ámbar, y 4 o más es rojo', () => {
    const recovery = (avgStress: number) => panel(week({ avgStress })).recovery;
    expect(recovery(2.9)).toBe('GREEN');
    expect(recovery(3)).toBe('AMBER');
    expect(recovery(3.9)).toBe('AMBER');
    expect(recovery(4)).toBe('RED');
  });

  it('el sueño de 6.0 a menos de 7.0 h es ámbar y el de menos de 6 h es rojo; con solo un dato, decide ese', () => {
    const recovery = (avgSleepHours: number | null, avgStress: number | null = null) =>
      panel(week({ avgSleepHours, avgStress })).recovery;
    expect(recovery(7)).toBe('GREEN');
    expect(recovery(6.9)).toBe('AMBER');
    expect(recovery(6)).toBe('AMBER');
    expect(recovery(5.9)).toBe('RED');
    expect(recovery(null, 2)).toBe('GREEN');
    expect(recovery(null)).toBe('NO_DATA');
  });

  it('la fatiga percibida: 1 y 2 verde, de 3 a menos de 4 ámbar, 4 o más roja', () => {
    const fatigue = (avgFatigue: number | null) => panel(week({ avgFatigue })).perceivedFatigue;
    expect(fatigue(2.9)).toBe('GREEN');
    expect(fatigue(3)).toBe('AMBER');
    expect(fatigue(4)).toBe('RED');
    expect(fatigue(null)).toBe('NO_DATA');
  });

  it('el estado general es el peor de los tres; «sin base» no suma alerta y lo que no tiene datos no decide', () => {
    expect(panel(week({ previousVolumesKg: [], avgStress: 2, avgFatigue: 2 })).overall).toBe(
      'GREEN',
    );
    expect(panel(week({ adjustedVolumeKg: 7000, avgFatigue: null })).overall).toBe('RED');
    expect(
      panel(week({ avgStress: null, avgSleepHours: null, avgFatigue: null, previousVolumesKg: [] }))
        .overall,
    ).toBe('NO_DATA');
  });

  it('sin volumen en la semana, la carga no tiene datos; una semana previa sin volumen no entra en la base', () => {
    const row = panel(week({ adjustedVolumeKg: 0, previousVolumesKg: [0, null, 4000] }));
    expect(row).toMatchObject({ load: 'NO_DATA', baseVolumeKg: 4000, loadChangePct: null });
    expect(panel(week({ previousVolumesKg: [null, 0] }))).toMatchObject({
      load: 'NO_BASE',
      baseVolumeKg: null,
    });
  });

  it('lleva método, versión e insumos con su hash (RN-D01)', () => {
    const run = runMethod(FATIGUE_PANEL_JV, mateoWeek(2));
    expect(run.ok && run.result).toMatchObject({
      methodCode: 'FATIGUE_PANEL_JV',
      methodVersion: '1.0.0',
    });
  });

  it('un promedio fuera de rango, más de 3 semanas previas o umbrales cruzados dan su código', () => {
    const codes = (input: FatiguePanelInput) => {
      const run = runMethod(FATIGUE_PANEL_JV, input);
      return run.ok ? [] : run.errors.map(({ code, rule }) => ({ code, rule }));
    };
    expect(codes(week({ avgStress: 6 }))).toEqual([{ code: 'NC-ENG-413', rule: 'RN-G16' }]);
    expect(codes(week({ adjustedVolumeKg: -1 }))).toEqual([{ code: 'NC-ENG-413', rule: 'RN-G16' }]);
    expect(codes(week({ previousVolumesKg: [1, 2, 3, 4] }))).toEqual([
      { code: 'NC-ENG-413', rule: 'RN-G16' },
    ]);
    expect(codes(week({ thresholds: { ...JV, loadAmberAbovePct: 40 } }))).toEqual([
      { code: 'NC-ENG-414', rule: 'RN-G16' },
    ]);
    expect(codes(week({ thresholds: { ...JV, recoveryAmberSleepBelowHours: 5 } }))).toEqual([
      { code: 'NC-ENG-414', rule: 'RN-G16' },
    ]);
  });
});
