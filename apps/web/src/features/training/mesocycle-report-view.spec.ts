import type { MesocycleReportBody } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  averageText,
  mesocycleMoment,
  percentText,
  reportWeekRows,
  summaryTiles,
} from './mesocycle-report-view';

const week = (weekNo: number, started = true) => ({
  weekNo,
  weekStart: ['2026-10-06', '2026-10-13'][weekNo - 1] ?? '2026-10-20',
  weekEnd: ['2026-10-12', '2026-10-19'][weekNo - 1] ?? '2026-10-26',
  isDeload: weekNo === 3,
  started,
});

const numbersWeek = (weekNo: number) => ({
  weekNo,
  plannedSets: 60,
  doneSets: 56,
  volumePct: (56 * 100) / 60,
  sessionsPlanned: 3,
  sessionsDone: 3,
  records: weekNo === 2 ? 3 : 0,
  sleepHours: 6.4,
  stress: 3,
  fatigue: 3,
  performancePct: 80,
  nutritionPct: 78,
});

// El mes de Mateo de la hoja (P-29): 223 ÷ 240 = 92.9 % y los promedios de su control semanal.
const BODY: MesocycleReportBody = {
  schemaVersion: 1,
  computedOn: '2026-11-11',
  program: {
    programId: '01920000-0000-7000-8000-000000000001',
    name: 'Full Body',
    versionNo: 1,
    oneRmMethod: { code: 'ONERM_EPLEY1985', version: '1.0.0' },
  },
  mesocycle: {
    position: 1,
    name: 'Mesociclo 1',
    startDate: '2026-10-06',
    endDate: '2026-10-26',
    weeks: [week(1), week(2), week(3, false)],
  },
  numbers: {
    method: { code: 'MESOCYCLE_REPORT_JV', version: '1.0.0' },
    engineVersion: '1.16.0',
    inputsHash: 'abc',
    weeks: [numbersWeek(1), numbersWeek(2)],
    total: {
      plannedSets: 240,
      doneSets: 223,
      volumePct: (223 * 100) / 240,
      sessionsPlanned: 12,
      sessionsDone: 12,
      records: 6,
    },
    averages: { sleepHours: 6.925, stress: 3, fatigue: 3, performancePct: 90, nutritionPct: 85 },
    records: [],
  },
  reviews: [
    {
      weekNo: 1,
      light: 'RED',
      suggestedAction: 'DELOAD',
      suggestedVolumeFactor: 0.825,
      coachDecision: 'KEEP',
      decidedVolumeFactor: null,
      method: { code: 'WEEKLY_REVIEW_JV', version: '3.1.0' },
    },
  ],
  evolution: null,
};

describe('RN-G19 · P-29 · el informe en pantalla', () => {
  it('el resumen redondea al presentar (RN-D09): 92.9 %, 6.9 h, 3 de 5 y las series del mes', () => {
    const tiles = summaryTiles(BODY.numbers as NonNullable<MesocycleReportBody['numbers']>);
    expect(tiles.map(({ label, value }) => [label, value])).toEqual([
      ['Volumen cumplido', '92.9 %'],
      ['Sesiones', '12 de 12'],
      ['Récords', '6'],
      ['Sueño promedio', '6.9 h'],
      ['Estrés promedio', '3.0 / 5'],
      ['Fatiga promedio', '3.0 / 5'],
      ['Rendimiento', '90.0 %'],
      ['Alimentación', '85.0 %'],
    ]);
    expect(tiles[0]?.detail).toBe('223 de 240 series');
    expect(percentText(null)).toBe('—');
    expect(averageText(null, 'h')).toBe('—');
  });

  it('cada semana con sus cifras y su control; la que no empezó, sin cifras', () => {
    const rows = reportWeekRows(BODY);
    expect(rows.map((row) => [row.weekNo, row.started, row.week?.records ?? null])).toEqual([
      [1, true, 0],
      [2, true, 3],
      [3, false, null],
    ]);
    expect(rows[0]).toMatchObject({
      label: 'Semana 1 · 6–12 oct.',
      action: 'Descarga 20–30 % y revisar',
      decision: 'Mantener',
    });
    expect(rows[1]).toMatchObject({ review: null, action: null, decision: null });
    expect(rows[2]?.isDeload).toBe(true);
  });

  it('un mesociclo cerrado, en curso o por empezar', () => {
    const mesocycle = {
      position: 2,
      name: 'Mesociclo 2',
      startDate: '2026-11-03',
      endDate: '2026-11-30',
      closed: false,
      report: null,
    };
    expect(mesocycleMoment(mesocycle, '2026-11-02')).toBe('UPCOMING');
    expect(mesocycleMoment(mesocycle, '2026-11-11')).toBe('CURRENT');
    expect(mesocycleMoment({ ...mesocycle, closed: true }, '2026-12-01')).toBe('CLOSED');
  });
});
