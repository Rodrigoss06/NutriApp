import { describe, expect, it } from 'vitest';
import type { TrackingApi } from '../../tracking/index.js';
import { AnalyticsMesocycleReportSource } from './mesocycle-report.source.js';
import type { AnalyticsStore } from './ports/analytics.ports.js';

const tracking = {
  dailyFacts: () =>
    Promise.resolve([
      {
        localDate: '2026-10-06',
        workouts: [
          {
            outcome: 'COMPLETED',
            programId: 'program-1',
            weekNo: 1,
            sets: [
              { isWarmup: true, muscleContributions: [{ muscle: 'CHEST', weight: 1 }] },
              { isWarmup: false, muscleContributions: [{ muscle: 'CHEST', weight: 1 }] },
              { isWarmup: false, muscleContributions: [{ muscle: 'CARDIO', weight: 1 }] },
            ],
          },
        ],
      },
      { localDate: '2026-10-07', workouts: [] },
    ]),
} as unknown as TrackingApi;

const store = {
  oneRmSeries: () =>
    Promise.resolve([
      {
        localDate: '2026-10-06',
        exerciseId: 'press-banca',
        formula: 'ONERM_EPLEY1985',
        bestEstimated1rmKg: 56,
        sourceSetId: 'set-1',
      },
    ]),
} as unknown as AnalyticsStore;

describe('RN-G19 · ADR-117 · lo que analytics da al informe del mesociclo', () => {
  it('los entrenos con sus series, marcando el calentamiento y el cardio (ADR-071)', async () => {
    const source = new AnalyticsMesocycleReportSource(tracking, store);
    expect(await source.workouts('patient', '2026-10-06', '2026-10-07')).toEqual([
      {
        outcome: 'COMPLETED',
        programId: 'program-1',
        weekNo: 1,
        sets: [
          { isWarmup: true, isCardio: false },
          { isWarmup: false, isCardio: false },
          { isWarmup: false, isCardio: true },
        ],
      },
    ]);
  });

  it('RN-F04 · los 1RM del read model, con su fórmula', async () => {
    const source = new AnalyticsMesocycleReportSource(tracking, store);
    expect(await source.oneRm('patient', '2000-01-01', '2026-11-02')).toEqual([
      {
        localDate: '2026-10-06',
        exerciseId: 'press-banca',
        formula: 'ONERM_EPLEY1985',
        estimated1rmKg: 56,
      },
    ]);
  });
});
