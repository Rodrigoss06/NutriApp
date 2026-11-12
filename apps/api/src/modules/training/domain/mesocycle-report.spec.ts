import { describe, expect, it } from 'vitest';
import {
  cleanTexts,
  doneInWeek,
  editProblem,
  mesocycleClosed,
  REPORT_ALREADY_SENT,
  REPORT_NOT_CLOSED,
  REPORT_TEXTS_REQUIRED,
  reportMesocycle,
  sendProblem,
  type ReportProgramSource,
  type ReportWorkout,
} from './mesocycle-report.js';

const TEXTS = {
  achievement: 'Cumplió 11 de 12 sesiones y mejoró la adherencia.',
  limitation: 'Sueño y estrés elevados durante la semana 2.',
  adjustment: 'Se aplicó descarga en la cuarta semana.',
  priority: 'Mantener tres sesiones y consolidar hábitos de sueño.',
};

const strength = (sets: readonly string[]) => ({
  primaryMuscles: [{ code: 'CHEST' }],
  secondaryMuscles: [{ code: 'TRICEPS' }],
  sets: sets.map((setType) => ({ setType })),
});

const cardio = {
  primaryMuscles: [{ code: 'CARDIO' }],
  secondaryMuscles: [],
  sets: [{ setType: 'WORKING' }],
};

// Dos mesociclos de un programa que empieza el 06/10: el primero de 4 semanas, con la última de descarga.
const PROGRAM: ReportProgramSource = {
  startDate: '2026-10-06',
  mesocycles: [
    {
      position: 2,
      name: 'Mesociclo 2',
      weeks: [{ weekNo: 5, isDeload: false, sessions: [{ exercises: [strength(['WORKING'])] }] }],
    },
    {
      position: 1,
      name: 'Mesociclo 1',
      weeks: [4, 2, 3, 1].map((weekNo) => ({
        weekNo,
        isDeload: weekNo === 4,
        sessions: [
          { exercises: [strength(['WARMUP', 'WORKING', 'WORKING', 'WORKING']), cardio] },
          { exercises: [strength(['WORKING', 'WORKING', 'WORKING'])] },
          {
            exercises: [
              strength(weekNo === 4 ? ['WORKING', 'WORKING'] : ['WORKING', 'WORKING', 'WORKING']),
            ],
          },
        ],
      })),
    },
  ],
};

describe('RN-G19 · P-28 · el informe del mesociclo', () => {
  it('se envía con el mesociclo cerrado y los cuatro textos; enviado, ya no se edita ni se reenvía', () => {
    expect(sendProblem({ status: 'DRAFT', ...TEXTS }, true)).toBeNull();
    expect(sendProblem({ status: 'DRAFT', ...TEXTS }, false)).toBe(REPORT_NOT_CLOSED);
    expect(sendProblem({ status: 'DRAFT', ...TEXTS, priority: '   ' }, true)).toBe(
      REPORT_TEXTS_REQUIRED,
    );
    expect(sendProblem({ status: 'DRAFT', ...TEXTS, limitation: null }, true)).toBe(
      REPORT_TEXTS_REQUIRED,
    );
    expect(sendProblem({ status: 'SENT', ...TEXTS }, true)).toBe(REPORT_ALREADY_SENT);
    expect(editProblem({ status: 'DRAFT' })).toBeNull();
    expect(editProblem({ status: 'SENT' })).toBe(REPORT_ALREADY_SENT);
  });

  it('los textos se guardan sin espacios de más, y vacíos quedan sin escribir', () => {
    expect(
      cleanTexts({ achievement: '  Logro  ', limitation: '', adjustment: '  ', priority: null }),
    ).toEqual({ achievement: 'Logro', limitation: null, adjustment: null, priority: null });
  });

  it('P-29 · las series planificadas son las de la rutina completa de cada semana, sin calentamiento ni cardio', () => {
    const mesocycle = reportMesocycle(PROGRAM, 1);
    expect(mesocycle).toMatchObject({
      position: 1,
      name: 'Mesociclo 1',
      startDate: '2026-10-06',
      endDate: '2026-11-02',
    });
    expect(
      mesocycle?.weeks.map(
        ({ weekNo, weekStart, weekEnd, plannedSets, sessionsPlanned, isDeload }) => [
          weekNo,
          weekStart,
          weekEnd,
          plannedSets,
          sessionsPlanned,
          isDeload,
        ],
      ),
    ).toEqual([
      [1, '2026-10-06', '2026-10-12', 9, 3, false],
      [2, '2026-10-13', '2026-10-19', 9, 3, false],
      [3, '2026-10-20', '2026-10-26', 9, 3, false],
      [4, '2026-10-27', '2026-11-02', 8, 3, true],
    ]);
    expect(reportMesocycle(PROGRAM, 3)).toBeNull();
  });

  it('07 §10 · cierra cuando su último día ya pasó en la fecha local del alumno', () => {
    const mesocycle = { endDate: '2026-11-02' };
    expect(mesocycleClosed(mesocycle, '2026-11-02')).toBe(false);
    expect(mesocycleClosed(mesocycle, '2026-11-03')).toBe(true);
  });

  it('ADR-083 · lo hecho cuenta en la semana de la sesión, en la línea del programa, sin calentamiento, cardio ni sesiones saltadas', () => {
    const set = (isWarmup = false, isCardio = false) => ({ isWarmup, isCardio });
    const workouts: ReportWorkout[] = [
      { outcome: 'COMPLETED', programId: 'v1', weekNo: 2, sets: [set(true), set(), set(), set()] },
      { outcome: 'PARTIAL', programId: 'v2', weekNo: 2, sets: [set(), set(false, true)] },
      { outcome: 'SKIPPED', programId: 'v2', weekNo: 2, sets: [] },
      { outcome: 'COMPLETED', programId: 'otra-linea', weekNo: 2, sets: [set()] },
      { outcome: 'COMPLETED', programId: 'v2', weekNo: 3, sets: [set()] },
      { outcome: 'COMPLETED', programId: null, weekNo: null, sets: [set()] },
    ];
    expect(doneInWeek(workouts, new Set(['v1', 'v2']), 2)).toEqual({
      sessionsDone: 2,
      doneSets: 4,
    });
  });
});
