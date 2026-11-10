import { describe, expect, it } from 'vitest';
import { panelAverages, previousVolumes } from './fatigue-panel.js';
import { versionOn } from './adjusted-volume.js';

describe('RN-G16 · P-23 y P-24 · lo que el panel de fatiga toma de cada semana', () => {
  it('promedia el estrés, el sueño y la fatiga de los días que traen cada dato, sin redondear', () => {
    expect(
      panelAverages([
        { stress: 3, sleepHours: 6.5, fatigue: null },
        { stress: 2, sleepHours: null, fatigue: 4 },
        { stress: null, sleepHours: 7, fatigue: 3 },
      ]),
    ).toEqual({ avgStress: 2.5, avgSleepHours: 6.75, avgFatigue: 3.5 });
    expect(panelAverages([])).toEqual({ avgStress: null, avgSleepHours: null, avgFatigue: null });
  });

  it('el sueño, guardado con un decimal, se promedia en décimas: 7 días de 7.1 h dan 7.1 exacto', () => {
    const week = Array.from({ length: 7 }, () => ({ stress: 3, sleepHours: 7.1, fatigue: 3 }));
    expect(panelAverages(week).avgSleepHours).toBe(7.1);
    expect(
      panelAverages([
        { stress: null, sleepHours: 6.8, fatigue: null },
        { stress: null, sleepHours: 7.2, fatigue: null },
      ]).avgSleepHours,
    ).toBe(7);
  });

  it('la base son las 3 semanas anteriores que ya empezaron, de la más antigua a la más reciente', () => {
    const volumes = new Map<number, number | null>([
      [1, 5220],
      [2, 5490],
      [3, 6336],
      [4, null],
    ]);
    expect(previousVolumes(volumes, 1)).toEqual([]);
    expect(previousVolumes(volumes, 3)).toEqual([5220, 5490]);
    expect(previousVolumes(volumes, 5)).toEqual([5490, 6336, null]);
    expect(previousVolumes(volumes, 9)).toEqual([]);
  });

  it('los umbrales de la semana: los de la organización si ya valen; si no, los globales de Jeremy', () => {
    const global = { id: 'g', organizationId: null, validFrom: '2026-01-01' };
    const own = { id: 'o', organizationId: 'org', validFrom: '2026-10-20' };
    expect(versionOn([global, own], '2026-10-13')?.id).toBe('g');
    expect(versionOn([global, own], '2026-10-20')?.id).toBe('o');
    expect(versionOn([own], '2026-10-13')).toBeNull();
  });
});
