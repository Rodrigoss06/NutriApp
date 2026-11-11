import { describe, expect, it } from 'vitest';
import periodizationSeed from '../../../../seeds/training/periodization-v3.json' with { type: 'json' };
import { runMethod } from '../../src/registry/run-method.js';
import {
  dailyIndication,
  macrocycleWeeks,
  movementTestStatus,
  prescriptionStatus,
  PRI_JV,
  PATTERN_BASE,
  proposeRoutine,
  READINESS_JV,
  routineSplit,
  screeningStatus,
  suggestedExercise,
  WEEKLY_REVIEW_JV,
  type PeriodizationPhase,
  type ReadinessDay,
  type ReadinessThresholds,
  type SafetyKeys,
  type WeeklyReviewDay,
  type WeeklyReviewThresholds,
} from '../../src/training/index.js';
import { expectOk, patternChoiceSeed } from '../support.js';

/** G-29 a G-40 reproducen la plantilla V3 de JV Fitness (Notion 03 y 07 §14): puntajes y factores exactos. */
const PHASES = periodizationSeed.phases as readonly PeriodizationPhase[];
const CHOICES = patternChoiceSeed();

describe('G-29 · RN-F13 · fase de una semana', () => {
  it('hipertrofia, semana 4: «Hipertrofia», «Sobrecarga», factor 1.1, moderada-alta, RIR 1, control y ajuste', () => {
    const week = macrocycleWeeks(PHASES, 'HYPERTROPHY', 12)[3];

    expect(week).toEqual({
      objective: 'HYPERTROPHY',
      weekNo: 4,
      phaseEs: 'Hipertrofia',
      phaseGoalEs: 'Sobrecarga',
      volumeFactor: 1.1,
      intensity: 'MODERATE_HIGH',
      targetRir: 1,
      isDeload: false,
      reviewKind: 'CONTROL',
    });
  });
});

describe('G-30 · RN-F13 · macrociclo de 10 semanas', () => {
  it('fuerza: la semana 10 es «Puesta a punto», factor 0.65, RIR 1, y no hay semanas 11 ni 12', () => {
    const weeks = macrocycleWeeks(PHASES, 'STRENGTH', 10);

    expect(weeks).toHaveLength(10);
    expect(weeks.at(-1)).toMatchObject({
      weekNo: 10,
      phaseEs: 'Puesta a punto',
      volumeFactor: 0.65,
      targetRir: 1,
    });
  });
});

// G-31 con 5 días: superior, inferior y acondicionamiento, la división de la hoja piloto (P-34, decisión de Rodrigo del
// 2026-11-11; ADR-112). Antes, push/pull/legs: el cambio se lleva a 03 con /notion-sync.
describe('G-31 · RN-F14 · división por días', () => {
  it.each([
    [2, 'FULL_BODY'],
    [3, 'FULL_BODY_ABC'],
    [4, 'UPPER_LOWER'],
    [5, 'UPPER_LOWER_CONDITIONING'],
  ])('%i días: %s', (days, split) => {
    expect(routineSplit(days)).toBe(split);
  });
});

describe('G-32 · RN-F14 · ejercicio por patrón y nivel', () => {
  it.each([
    ['BEGINNER', 'Sentadilla goblet'],
    ['INTERMEDIATE', 'Prensa de piernas'],
    ['ADVANCED', 'Sentadilla trasera'],
  ] as const)('sentadilla en %s: %s', (level, exercise) => {
    expect(suggestedExercise(CHOICES, 'SQUAT', level)?.exerciseName).toBe(exercise);
  });
});

describe('G-33 · RN-F15 · las llaves de seguridad', () => {
  const open: SafetyKeys = {
    medicalClearance: 'CLEARED',
    alarmSymptoms: false,
    movementStatuses: ['FIT'],
    screening: { status: 'GREEN', reviewDecision: null },
  };

  it('alta pendiente y una prueba con dolor: BLOQUEADO · ALTA PENDIENTE', () => {
    expect(
      prescriptionStatus({ ...open, medicalClearance: 'PENDING', movementStatuses: ['REFER'] }),
    ).toBe('BLOCKED_CLEARANCE');
  });

  it('con alta y la misma prueba: BLOQUEADO · REVISAR DOLOR', () => {
    expect(prescriptionStatus({ ...open, movementStatuses: ['REFER'] })).toBe('BLOCKED_PAIN');
  });

  it('con alta, sin dolor y cribado verde: PENDIENTE DE APROBACIÓN', () => {
    expect(prescriptionStatus(open)).toBe('PENDING_APPROVAL');
  });
});

describe('G-34 · RN-F15 · estado de una prueba postural', () => {
  it.each([
    ['2 y 1', { rightScore: 2, leftScore: 1 }, 'CAUTION'],
    ['0 y 2', { rightScore: 0, leftScore: 2 }, 'MODIFY'],
    ['2 y 2 con dolor', { rightScore: 2, leftScore: 2, pain: true }, 'REFER'],
    ['2 y 2 con asimetría', { rightScore: 2, leftScore: 2, asymmetry: true }, 'CAUTION'],
    ['2 y sin puntaje', { rightScore: 2, leftScore: null }, 'PENDING'],
  ] as const)('%s', (_case, score, status) => {
    expect(movementTestStatus({ pain: false, asymmetry: false, ...score })).toBe(status);
  });
});

describe('G-35 · RN-F15 · cribado', () => {
  const allNo = {
    S01: false,
    S02: false,
    S03: false,
    S04: false,
    S05: false,
    S06: false,
    S07: false,
    S08: false,
  };

  it('con S02 Sí: rojo', () => {
    expect(screeningStatus({ ...allNo, S02: true })).toBe('RED');
  });

  it('solo S07 Sí: ámbar', () => {
    expect(screeningStatus({ ...allNo, S07: true })).toBe('AMBER');
  });

  it('todo No: verde', () => {
    expect(screeningStatus(allNo)).toBe('GREEN');
  });
});

describe('G-40 · RN-F16 · perfil de rendimiento', () => {
  /** Respuestas que dan 80, 60, 70, 90, 50, 70 y 60, de objetivo a adherencia. */
  const answers = {
    G03: 4,
    G04: 4,
    A01: 3,
    A02: 45,
    A03: 3,
    A04: 3,
    E01: 'Y1_3',
    E02: 'INTERMITTENT',
    E03: 4,
    E04: 3,
    R01: 8,
    R02: 5,
    R03: 4,
    R04: 2,
    R05: 2,
    R06: 5,
    L01: 8,
    L02: 3000,
    L03: 'WEEKLY',
    L04: 'YES',
    N01: 'VARIABLE',
    N02: 'USUALLY',
    N03: 'MODERATE',
    N04: 1.5,
    H01: 3,
    H02: 3,
    H03: 3,
    H04: 3,
    H05: 3,
  } as const;

  it('dominios de 80, 60, 70, 90, 50, 70 y 60: PRI 69.5, con sus clases', () => {
    const { outputs } = expectOk(runMethod(PRI_JV, { answers }));

    expect(outputs.domainScores).toEqual({
      OBJECTIVE: 80,
      AVAILABILITY: 60,
      EXPERIENCE: 70,
      RECOVERY: 90,
      LIFESTYLE: 50,
      NUTRITION: 70,
      ADHERENCE: 60,
    });
    expect(outputs.pri).toBe(69.5);
    expect(outputs.classes).toMatchObject({
      recoveryCapacity: 'HIGH',
      volumeTolerance: 'MODERATE',
      supervision: 'MODERATE',
      checkIn: 'WEEKLY_OR_BIWEEKLY',
      topPriority: 'LIFESTYLE',
    });
  });
});

/** Los umbrales base de la V3 (07 §11), como la fila global de training.readiness_threshold. */
const V3_THRESHOLDS: ReadinessThresholds = {
  neutralScore: 75,
  readinessGreenMin: 75,
  readinessRedBelow: 60,
  performanceMinPct: 90,
};

/** Un día sin ningún dato: cada caso llena lo suyo. */
const EMPTY_DAY: ReadinessDay = {
  sessionMinutes: null,
  sessionRpe: null,
  sleepHours: null,
  fatigue: null,
  soreness: null,
  stress: null,
  motivation: null,
  menstrualSymptoms: null,
  performancePlanned: null,
  performanceActual: null,
  restingHrBpm: null,
  hrvMs: null,
};

describe('G-36 · RN-G14 · RN-G15 · recuperación del día', () => {
  it('sueño 7 h (objetivo 8), FC 62 (basal 58), sin HRV, fatiga 2, dolor 3, estrés 2, motivación 4 y rendimiento 95 %: partes 87.5, 76, 75 y 75; recuperación 78.375; VERDE', () => {
    const { outputs } = expectOk(
      runMethod(READINESS_JV, {
        day: {
          ...EMPTY_DAY,
          sleepHours: 7,
          restingHrBpm: 62,
          fatigue: 2,
          soreness: 3,
          stress: 2,
          motivation: 4,
          performancePlanned: 100,
          performanceActual: 95,
        },
        baseline: { sleepTargetHours: 8, restingHrBpm: 58, hrvMs: 50 },
        thresholds: V3_THRESHOLDS,
      }),
    );

    expect(outputs.components).toEqual({ sleep: 87.5, heartRate: 76, hrv: 75, subjective: 75 });
    expect(outputs.neutralComponents).toEqual(['hrv']);
    expect(outputs.readinessScore).toBe(78.375);
    expect(outputs.performancePct).toBe(95);
    expect(outputs.indication).toBe('GREEN');
  });
});

describe('G-37 · RN-G15 · indicación del día', () => {
  it.each([
    [
      'recuperación 70',
      { readinessScore: 70, menstrualSymptoms: null, performancePct: null },
      'YELLOW',
    ],
    [
      'recuperación 58',
      { readinessScore: 58, menstrualSymptoms: null, performancePct: null },
      'RED',
    ],
    [
      '80 con síntomas del ciclo 3',
      { readinessScore: 80, menstrualSymptoms: 3, performancePct: null },
      'RED',
    ],
    [
      '80 con rendimiento 85 %',
      { readinessScore: 80, menstrualSymptoms: null, performancePct: 85 },
      'YELLOW',
    ],
  ] as const)('%s: %s', (_, day, indication) => {
    expect(dailyIndication(day, V3_THRESHOLDS)).toBe(indication);
  });
});

describe('G-38 · RN-G14 · carga sRPE y rendimiento', () => {
  const run = (day: Partial<ReadinessDay>) =>
    expectOk(
      runMethod(READINESS_JV, {
        day: { ...EMPTY_DAY, ...day },
        baseline: { sleepTargetHours: 8, restingHrBpm: null, hrvMs: null },
        thresholds: V3_THRESHOLDS,
      }),
    ).outputs;

  it('60 min con RPE 7: carga 420', () => {
    expect(run({ sessionMinutes: 60, sessionRpe: 7 }).srpeLoad).toBe(420);
  });

  it('real 95 con plan 100: 95 %; real 130 con plan 100: 120 %, el tope', () => {
    expect(run({ performancePlanned: 100, performanceActual: 95 }).performancePct).toBe(95);
    expect(run({ performancePlanned: 100, performanceActual: 130 }).performancePct).toBe(120);
  });
});

/** Los umbrales semanales de la V3 (07 §11). */
const V3_WEEKLY: WeeklyReviewThresholds = {
  performanceMinPct: 90,
  weeklySleepMinHours: 6.5,
  fatigueSorenessAmberAbove: 4,
  nutritionMinPct: 80,
};

const WEEK_DAY: WeeklyReviewDay = {
  sessionMinutes: 60,
  sessionRpe: 7,
  sleepHours: 7.5,
  restingHrBpm: null,
  hrvMs: null,
  fatigue: 2,
  soreness: 2,
  performancePct: 100,
  nutritionCompliancePct: 90,
  menstrualSymptoms: null,
};

describe('G-39 · RN-G16 · control semanal', () => {
  const review = (days: readonly Partial<WeeklyReviewDay>[], plannedVolumeFactor: number) =>
    expectOk(
      runMethod(WEEKLY_REVIEW_JV, {
        days: days.map((day) => ({ ...WEEK_DAY, ...day })),
        plannedVolumeFactor,
        thresholds: V3_WEEKLY,
      }),
    ).outputs;

  it('rendimiento promedio 88 % y factor 1.1: ROJO, factor 0.825, «descarga 20–30 % y revisar»', () => {
    const outputs = review(
      [{ performancePct: 86 }, { performancePct: 90 }, { performancePct: 88 }],
      1.1,
    );

    expect(outputs.aggregates.avgPerformancePct).toBe(88);
    expect(outputs.light).toBe('RED');
    expect(outputs.suggestedVolumeFactor).toBeCloseTo(0.825, 10);
    expect(outputs.suggestedAction).toBe('DELOAD');
  });

  it('fatiga promedio 4.2 y factor 1.0: ÁMBAR, 0.90, «ajustar 5–15 %»', () => {
    const outputs = review(
      [{ fatigue: 4 }, { fatigue: 4 }, { fatigue: 5 }, { fatigue: 4 }, { fatigue: 4 }],
      1,
    );

    expect(outputs.aggregates.avgFatigue).toBeCloseTo(4.2, 10);
    expect(outputs.light).toBe('AMBER');
    expect(outputs.suggestedVolumeFactor).toBe(0.9);
    expect(outputs.suggestedAction).toBe('ADJUST');
  });

  it('sin sesiones: FALTA REGISTRO, sin factor sugerido', () => {
    const outputs = review([{ sessionMinutes: 0 }, { sessionMinutes: null }], 1);

    expect(outputs.aggregates.sessions).toBe(0);
    expect(outputs.light).toBe('NO_DATA');
    expect(outputs.suggestedVolumeFactor).toBeNull();
    expect(outputs.suggestedAction).toBe('MISSING_LOG');
  });
});

describe('Criterio 4 de P12 · RN-F14 · la propuesta coincide con la hoja PRESCRIPCION de la V3', () => {
  /** Hipertrofia, principiante, 4 días, fila por fila. «RDL con mancuernas» es el alias de la hoja (P-11). */
  const SHEET = [
    ['Superior', 'SQUAT', 'Sentadilla goblet'],
    ['Superior', 'HORIZONTAL_PUSH', 'Press en máquina'],
    ['Superior', 'HORIZONTAL_PULL', 'Remo sentado'],
    ['Superior', 'HINGE', 'Peso muerto rumano con mancuernas'],
    ['Superior', 'SHOULDER', 'Elevación lateral'],
    ['Superior', 'CORE_ANTI_EXTENSION', 'Dead bug'],
    ['Superior', 'BICEPS', 'Curl con mancuerna'],
    ['Superior', 'TRICEPS', 'Extensión en polea'],
    ['Inferior', 'HINGE', 'Peso muerto rumano con mancuernas'],
    ['Inferior', 'VERTICAL_PULL', 'Jalón al pecho'],
    ['Inferior', 'VERTICAL_PUSH', 'Press landmine'],
    ['Inferior', 'UNILATERAL', 'Split squat asistido'],
    ['Inferior', 'HIP_EXTENSION', 'Puente de glúteo'],
    ['Inferior', 'CORE_ANTI_ROTATION', 'Pallof press'],
    ['Inferior', 'CALF', 'Elevación de talones'],
    ['Inferior', 'CONDITIONING', 'Caminata inclinada'],
    ['Superior', 'SQUAT', 'Sentadilla goblet'],
    ['Superior', 'HORIZONTAL_PUSH', 'Press en máquina'],
    ['Superior', 'HORIZONTAL_PULL', 'Remo sentado'],
    ['Superior', 'HINGE', 'Peso muerto rumano con mancuernas'],
    ['Superior', 'VERTICAL_PULL', 'Jalón al pecho'],
    ['Superior', 'SHOULDER', 'Elevación lateral'],
    ['Superior', 'BICEPS', 'Curl con mancuerna'],
    ['Superior', 'TRICEPS', 'Extensión en polea'],
    ['Inferior', 'HINGE', 'Peso muerto rumano con mancuernas'],
    ['Inferior', 'UNILATERAL', 'Split squat asistido'],
    ['Inferior', 'HIP_EXTENSION', 'Puente de glúteo'],
    ['Inferior', 'VERTICAL_PUSH', 'Press landmine'],
    ['Inferior', 'VERTICAL_PULL', 'Jalón al pecho'],
    ['Inferior', 'CORE_ANTI_EXTENSION', 'Dead bug'],
    ['Inferior', 'CALF', 'Elevación de talones'],
    ['Inferior', 'CONDITIONING', 'Caminata inclinada'],
  ];

  // Plantilla 2.0.0 (ADR-112): con 4 días van las sesiones de la hoja piloto, y la V3 queda para cuerpo completo. Sus 3 primeros
  // días (24 filas) siguen iguales, con el tempo y el descanso de cada patrón (P-34) en vez de 2-1-2 y 90 s.
  it('los 3 primeros días de la hoja (24 filas): patrón y ejercicio, con 3 series de 8 a 12 y RIR 2', () => {
    const proposal = proposeRoutine({ level: 'BEGINNER', daysPerWeek: 3 }, CHOICES);
    const blocks = proposal.days.flatMap((day) => day.blocks);

    expect(proposal.split).toBe('FULL_BODY_ABC');
    expect(blocks.map((b) => [b.pattern, b.suggested?.exerciseName])).toEqual(
      SHEET.slice(0, 24).map(([, pattern, exercise]) => [pattern, exercise]),
    );
    for (const block of blocks) {
      expect(block).toMatchObject({
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        loadKind: 'RIR',
        loadValue: 2,
        tempo: PATTERN_BASE[block.pattern].tempo,
        restSeconds: PATTERN_BASE[block.pattern].restSeconds,
      });
    }
  });
});
