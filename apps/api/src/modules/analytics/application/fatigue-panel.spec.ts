import { describe, expect, it } from 'vitest';
import type { FatiguePanelThresholdRow } from '../../training/index.js';
import { fatiguePanelOf, type PanelWeekInput } from './fatigue-panel.js';

const JV: FatiguePanelThresholdRow = {
  id: 'global',
  organizationId: null,
  validFrom: '2026-01-01',
  recoveryRedStressMin: 4,
  recoveryRedSleepBelowHours: 6,
  recoveryAmberStressMin: 3,
  recoveryAmberSleepBelowHours: 7,
  fatigueRedMin: 4,
  fatigueAmberMin: 3,
  loadAmberAbovePct: 15,
  loadRedAbovePct: 30,
};

/** Siete días iguales: el registro diario de la hoja trae un valor por semana. */
const days = (stress: number, sleepHours: number, fatigue: number) =>
  Array.from({ length: 7 }, () => ({ stress, sleepHours, fatigue }));

const week = (
  weekNo: number,
  adjustedVolumeKg: number | null,
  logged: PanelWeekInput['days'],
  started = true,
): PanelWeekInput => ({
  weekNo,
  weekStart: `2026-10-${String(6 + 7 * (weekNo - 1)).padStart(2, '0')}`,
  started,
  adjustedVolumeKg,
  days: logged,
});

// Mateo Prueba, la hoja piloto: semanas 1 a 4 con registros, la 5 cerrada sin nada y la 6 sin empezar.
const MATEO = [
  week(1, 5220, days(3, 6.4, 3)),
  week(2, 5490, days(4, 6.8, 4)),
  week(3, 6336, days(3, 7.1, 3)),
  week(4, 3375, days(2, 7.4, 2)),
  week(5, null, []),
  week(6, null, [], false),
];

describe('RN-G16 · P-23 y P-24 · el panel de fatiga de cada semana del macrociclo', () => {
  it('reproduce el panel de Mateo de la hoja, con la versión de los umbrales y el hash de sus insumos', () => {
    const panel = fatiguePanelOf(MATEO, [JV]);
    const rows = [1, 2, 3, 4, 5].map((n) => panel.get(n));
    expect(rows.map((row) => row?.overall)).toEqual(['AMBER', 'RED', 'AMBER', 'GREEN', 'NO_DATA']);
    expect(rows.map((row) => row?.load)).toEqual(['NO_BASE', 'GREEN', 'AMBER', 'GREEN', 'NO_DATA']);
    expect(rows.map((row) => row?.baseVolumeKg)).toEqual([null, 5220, 5355, 5682, 5067]);
    expect(rows[2]).toMatchObject({ thresholdId: 'global', avgStress: 3, avgSleepHours: 7.1 });
    expect(rows[2]?.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(panel.get(6)).toBeNull();
  });

  it('sin umbrales vigentes al empezar la semana no hay panel: no se inventan', () => {
    const later = { ...JV, validFrom: '2026-10-20' };
    const panel = fatiguePanelOf(MATEO, [later]);
    expect(panel.get(2)).toBeNull();
    expect(panel.get(3)?.load).toBe('AMBER');
  });
});
