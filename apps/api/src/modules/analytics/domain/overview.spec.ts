import {
  LOW_ADHERENCE_PCT as CONTRACT_LOW_ADHERENCE,
  NO_RECENT_LOGS_DAYS as CONTRACT_QUIET_DAYS,
  OVERVIEW_ALERTS as CONTRACT_ALERTS,
} from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  adherencePct,
  adherenceWindows,
  LOW_ADHERENCE_PCT,
  NO_RECENT_LOGS_DAYS,
  OVERVIEW_ALERTS,
  overviewAlerts,
  type OverviewInput,
} from './overview.js';

const TODAY = '2026-11-07';

const quiet: OverviewInput = {
  today: TODAY,
  lastRecordDate: '2026-11-06',
  firstTargetDate: '2026-10-01',
  unreadNotes: 0,
  latestCheckin: null,
  adherence7dPct: 100,
  latestWeek: null,
  undecidedReviews: 0,
};

const day = (targetKcal: number | null, kcalInRange: boolean | null) => ({
  targetKcal,
  kcalInRange,
});

describe('RF-34 · las alertas del panel del profesional (ADR-086, ADR-093)', () => {
  it('los valores y los códigos son los mismos que lee la web', () => {
    expect(NO_RECENT_LOGS_DAYS).toBe(CONTRACT_QUIET_DAYS);
    expect(LOW_ADHERENCE_PCT).toBe(CONTRACT_LOW_ADHERENCE);
    expect([...OVERVIEW_ALERTS]).toEqual([...CONTRACT_ALERTS]);
  });

  it('un paciente al día no tiene alertas', () => {
    expect(overviewAlerts(quiet)).toEqual([]);
  });

  it('sin registros en los 3 días que ya terminaron: hoy todavía no cuenta', () => {
    expect(overviewAlerts({ ...quiet, lastRecordDate: '2026-11-04' })).toEqual([]);
    expect(overviewAlerts({ ...quiet, lastRecordDate: '2026-11-03' })).toEqual(['NO_RECENT_LOGS']);
  });

  it('quien nunca registró cuenta desde su primera meta; sin metas ni registros no se le espera nada', () => {
    const never = { ...quiet, lastRecordDate: null };
    expect(overviewAlerts({ ...never, firstTargetDate: '2026-11-05' })).toEqual([]);
    expect(overviewAlerts({ ...never, firstTargetDate: '2026-11-04' })).toEqual(['NO_RECENT_LOGS']);
    expect(overviewAlerts({ ...never, firstTargetDate: null })).toEqual([]);
  });

  it('RN-G09 · adherencia de 7 días baja si es menor que 80 %; sin días con meta, no hay adherencia', () => {
    expect(overviewAlerts({ ...quiet, adherence7dPct: 80 })).toEqual([]);
    expect(overviewAlerts({ ...quiet, adherence7dPct: 79.9 })).toEqual(['LOW_ADHERENCE']);
    expect(overviewAlerts({ ...quiet, adherence7dPct: null })).toEqual([]);
  });

  it('RN-G09 · días en rango ÷ días con meta, de los 7 y de los 30 días que terminaron ayer', () => {
    expect(
      adherencePct([day(1800, true), day(1800, false), day(null, null), day(1800, true)]),
    ).toBe((2 / 3) * 100);
    expect(adherencePct([day(null, null)])).toBeNull();
    expect(adherenceWindows(TODAY)).toEqual({
      to: '2026-11-06',
      from7d: '2026-10-31',
      from30d: '2026-10-08',
    });
  });

  it('RN-G13 · notas del paciente sin leer', () => {
    expect(overviewAlerts({ ...quiet, unreadNotes: 2 })).toEqual(['UNREAD_NOTES']);
  });

  it('RN-G15 · el semáforo del día: el último registro diario si es de hoy o de ayer', () => {
    const checkin = (
      localDate: string,
      indication: 'GREEN' | 'YELLOW' | 'RED' | 'NO_DATA' | null,
    ) => ({
      ...quiet,
      latestCheckin: { localDate, indication },
    });
    expect(overviewAlerts(checkin(TODAY, 'RED'))).toEqual(['READINESS_RED']);
    expect(overviewAlerts(checkin('2026-11-06', 'YELLOW'))).toEqual(['READINESS_YELLOW']);
    expect(overviewAlerts(checkin('2026-11-05', 'RED'))).toEqual([]);
    expect(overviewAlerts(checkin(TODAY, 'GREEN'))).toEqual([]);
    expect(overviewAlerts(checkin(TODAY, 'NO_DATA'))).toEqual([]);
    expect(overviewAlerts(checkin(TODAY, null))).toEqual([]);
  });

  it('RN-F17 · el semáforo de la semana que terminó hace 7 días o menos, y los controles sin decidir', () => {
    const week = (weekEnd: string, light: 'GREEN' | 'AMBER' | 'RED' | 'NO_DATA') => ({
      ...quiet,
      latestWeek: { weekEnd, light },
    });
    expect(overviewAlerts(week('2026-11-01', 'RED'))).toEqual(['WEEKLY_RED']);
    expect(overviewAlerts(week('2026-10-31', 'AMBER'))).toEqual(['WEEKLY_AMBER']);
    expect(overviewAlerts(week('2026-10-30', 'RED'))).toEqual([]);
    expect(overviewAlerts(week('2026-11-01', 'NO_DATA'))).toEqual([]);
    expect(overviewAlerts({ ...quiet, undecidedReviews: 1 })).toEqual(['PENDING_REVIEW']);
  });

  it('varias a la vez, siempre en el mismo orden', () => {
    expect(
      overviewAlerts({
        ...quiet,
        lastRecordDate: '2026-10-20',
        adherence7dPct: 0,
        unreadNotes: 1,
        undecidedReviews: 2,
        latestWeek: { weekEnd: '2026-11-01', light: 'RED' },
      }),
    ).toEqual(['NO_RECENT_LOGS', 'LOW_ADHERENCE', 'UNREAD_NOTES', 'WEEKLY_RED', 'PENDING_REVIEW']);
  });
});
