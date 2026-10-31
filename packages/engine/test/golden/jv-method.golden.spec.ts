import { describe, expect, it } from 'vitest';
import periodizationSeed from '../../../../seeds/training/periodization-v3.json' with { type: 'json' };
import { runMethod } from '../../src/registry/run-method.js';
import {
  macrocycleWeeks,
  movementTestStatus,
  prescriptionStatus,
  PRI_JV,
  proposeRoutine,
  routineSplit,
  screeningStatus,
  suggestedExercise,
  type PeriodizationPhase,
  type SafetyKeys,
} from '../../src/training/index.js';
import { expectOk, patternChoiceSeed } from '../support.js';

/** G-29 a G-35 y G-40 reproducen la plantilla V3 de JV Fitness (Notion 03 y 07 §14): puntajes y factores exactos. */
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

describe('G-31 · RN-F14 · división por días', () => {
  it.each([
    [2, 'FULL_BODY'],
    [3, 'FULL_BODY_ABC'],
    [4, 'UPPER_LOWER'],
    [5, 'PUSH_PULL_LEGS'],
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

  it('las 32 filas: sesión, patrón y ejercicio, con 3 series de 8 a 12, RIR 2, tempo 2-1-2 y 90 s', () => {
    const proposal = proposeRoutine({ level: 'BEGINNER', daysPerWeek: 4 }, CHOICES);
    const blocks = proposal.days.flatMap((day) =>
      day.blocks.map((block) => ({ session: day.name, ...block })),
    );

    expect(proposal.split).toBe('UPPER_LOWER');
    expect(blocks.map((b) => [b.session, b.pattern, b.suggested?.exerciseName])).toEqual(SHEET);
    for (const block of blocks) {
      expect(block).toMatchObject({
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        loadKind: 'RIR',
        loadValue: 2,
        tempo: '2-1-2',
        restSeconds: 90,
      });
    }
  });
});
