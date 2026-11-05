import type { Checkin, MeTraining } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  hasData,
  initialValues,
  parseCheckin,
  performanceFromTraining,
  sessionPrefill,
  type CheckinValues,
} from './checkin';

const DAY = { clientId: '0193a000-0000-7000-8000-000000000001', localDate: '2026-11-04' };
const EMPTY = initialValues(null, null);
const GOOD: CheckinValues = { ...EMPTY, sleepHours: 8, fatigue: 2, motivation: 4 };

const CHECKIN: Checkin = {
  ...EMPTY,
  id: '0193a000-0000-7000-8000-000000000002',
  clientId: DAY.clientId,
  localDate: DAY.localDate,
  sleepHours: 7.5,
  fatigue: 3,
  menstrualSymptoms: 1,
  status: 'ACTIVE',
  readiness: null,
};

const workout = (changes: Partial<MeTraining['workouts'][number]>) => ({
  id: '0193a000-0000-7000-8000-000000000003',
  clientId: DAY.clientId,
  localDate: DAY.localDate,
  sessionId: 'session-1',
  outcome: 'COMPLETED' as const,
  durationMinutes: 50,
  sessionRpe: 7,
  tonnageKg: 900,
  setCount: 2,
  status: 'ACTIVE' as const,
  ...changes,
});
const session = (plannedTonnageKg: number | null) =>
  ({ id: 'session-1', plannedTonnageKg }) as MeTraining['sessions'][number];

describe('RN-G11 · RN-G12 · el registro diario parte de lo ya registrado', () => {
  it('corregir el de hoy muestra lo que se anotó', () => {
    expect(initialValues(CHECKIN, null)).toMatchObject({
      sleepHours: 7.5,
      fatigue: 3,
      menstrualSymptoms: 1,
      sessionMinutes: null,
    });
  });

  it('sin registro, la sesión registrada da la duración y el RPE', () => {
    expect(initialValues(null, { durationMinutes: 50, sessionRpe: 7 })).toMatchObject({
      sessionMinutes: 50,
      sessionRpe: 7,
      sleepHours: null,
    });
    expect(
      sessionPrefill([workout({ durationMinutes: null, sessionRpe: null }), workout({})]),
    ).toEqual({ durationMinutes: 50, sessionRpe: 7 });
    expect(sessionPrefill([])).toBeNull();
  });

  it('07 §9: un registro vacío no se guarda', () => {
    expect(hasData(EMPTY)).toBe(false);
    expect(hasData(GOOD)).toBe(true);
  });
});

describe('RN-G17 · el cuerpo del registro diario', () => {
  it('sin la autorización vigente, los síntomas del ciclo no se envían', () => {
    const values = { ...GOOD, menstrualSymptoms: 2 };

    expect(parseCheckin(values, DAY, false)).toMatchObject({
      ok: true,
      body: { menstrualSymptoms: null, sleepHours: 8 },
    });
    expect(parseCheckin(values, DAY, true)).toMatchObject({
      ok: true,
      body: { menstrualSymptoms: 2 },
    });
  });

  it('un dato fuera de rango dice cuál y cómo corregirlo', () => {
    expect(parseCheckin({ ...GOOD, sleepHours: 7.3, restingHrBpm: 300 }, DAY, false)).toEqual({
      ok: false,
      problems: {
        sleepHours: 'De 0 a 24 horas, en medias horas: 7 o 7.5.',
        restingHrBpm: 'De 25 a 220 latidos por minuto, sin decimales.',
      },
    });
  });
});

describe('P-09 · ADR-083 · el rendimiento sale de la sesión registrada', () => {
  it('con tonelaje prescrito y registrado, lo calcula la API: no se pide', () => {
    expect(performanceFromTraining({ sessions: [session(960)], workouts: [workout({})] })).toEqual({
      plannedKg: 960,
      loggedKg: 900,
    });
  });

  it('sin tonelaje prescrito, sin series o omitida, lo escribe el paciente', () => {
    expect(
      performanceFromTraining({ sessions: [session(null)], workouts: [workout({})] }),
    ).toBeNull();
    expect(
      performanceFromTraining({ sessions: [session(960)], workouts: [workout({ tonnageKg: 0 })] }),
    ).toBeNull();
    expect(
      performanceFromTraining({
        sessions: [session(960)],
        workouts: [workout({ outcome: 'SKIPPED', tonnageKg: 0 })],
      }),
    ).toBeNull();
  });
});
