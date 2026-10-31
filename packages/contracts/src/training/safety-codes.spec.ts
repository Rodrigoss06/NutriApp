import {
  CRITICAL_SCREENING_QUESTIONS,
  MEDICAL_CLEARANCES,
  PRESCRIPTION_STATUSES,
  REVIEW_SCREENING_QUESTIONS,
  SCREENING_DECISIONS,
  SCREENING_STATUSES,
  TRAINING_OBJECTIVES,
} from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import {
  SCREENING_DECISION_CODES,
  SCREENING_QUESTIONS,
  SCREENING_STATUS_CODES,
  screeningAnswersSchema,
} from '../clinical/screening.js';
import {
  createFunctionalEvaluationSchema,
  saveMovementTestSchema,
  savePhysicalResultSchema,
} from '../assessment/functional.js';
import {
  MEDICAL_CLEARANCE_CODES,
  PRESCRIPTION_STATUS_CODES,
  saveAthleteProfileSchema,
  TRAINING_OBJECTIVE_CODES,
} from './athlete-profile.js';

const NO = {
  S01: false,
  S02: false,
  S03: false,
  S04: false,
  S05: false,
  S06: false,
  S07: false,
  S08: false,
};

describe('RN-F15 · los códigos de seguridad son los del motor', () => {
  it('llaves, estados y decisiones', () => {
    expect(MEDICAL_CLEARANCE_CODES).toEqual(MEDICAL_CLEARANCES);
    expect(PRESCRIPTION_STATUS_CODES).toEqual(PRESCRIPTION_STATUSES);
    expect(SCREENING_STATUS_CODES).toEqual(SCREENING_STATUSES);
    expect(SCREENING_DECISION_CODES).toEqual(SCREENING_DECISIONS);
    expect(TRAINING_OBJECTIVE_CODES).toEqual(TRAINING_OBJECTIVES);
  });

  it('las preguntas críticas y de revisión son las del motor, en su orden', () => {
    expect(SCREENING_QUESTIONS.filter((q) => q.critical).map((q) => q.code)).toEqual(
      CRITICAL_SCREENING_QUESTIONS,
    );
    expect(SCREENING_QUESTIONS.filter((q) => !q.critical).map((q) => q.code)).toEqual(
      REVIEW_SCREENING_QUESTIONS,
    );
  });
});

describe('RN-F15 · 07 §3 · lo que acepta el contrato', () => {
  it('el cribado pide todas las preguntas: uno a medias no dice nada de la seguridad', () => {
    expect(screeningAnswersSchema.safeParse(NO).success).toBe(true);
    expect(screeningAnswersSchema.safeParse({ ...NO, S09: 'Detalle' }).success).toBe(true);
    const incomplete = Object.fromEntries(Object.entries(NO).filter(([code]) => code !== 'S08'));
    expect(screeningAnswersSchema.safeParse(incomplete).success).toBe(false);
    expect(screeningAnswersSchema.safeParse({ ...NO, S10: true }).success).toBe(false);
  });

  it('las pruebas físicas llevan su momento; la postura, no', () => {
    const measuredAt = '2026-10-31T12:00:00.000Z';
    const parse = (input: object) =>
      createFunctionalEvaluationSchema.safeParse({ measuredAt, ...input }).success;

    expect(parse({ kind: 'FITNESS', moment: 'BASELINE' })).toBe(true);
    expect(parse({ kind: 'FITNESS' })).toBe(false);
    expect(parse({ kind: 'MOVEMENT' })).toBe(true);
    expect(parse({ kind: 'MOVEMENT', moment: 'WEEK_4' })).toBe(false);
  });

  it('una prueba postural va de 0 a 2 por lado, y un lado puede faltar', () => {
    const parse = (input: object) => saveMovementTestSchema.safeParse(input).success;

    expect(parse({ rightScore: 0, leftScore: 2 })).toBe(true);
    expect(parse({ rightScore: null, pain: true })).toBe(true);
    expect(parse({ rightScore: 3 })).toBe(false);
    expect(parse({ rightScore: 1.5 })).toBe(false);
  });

  it('la evidencia por enlace solo con https (07 §4)', () => {
    const url = (evidenceUrl: string) => saveMovementTestSchema.safeParse({ evidenceUrl }).success;

    expect(url('https://carpeta.example.com/abc')).toBe(true);
    expect(url('http://carpeta.example.com/abc')).toBe(false);
    expect(url('javascript:alert(1)')).toBe(false);
    expect(savePhysicalResultSchema.safeParse({ value: 10.123 }).success).toBe(false);
  });

  it('el perfil: de 2 a 5 días, de 8 a 12 semanas y 12 por defecto (07 §2)', () => {
    const profile = {
      expectedRevision: 0,
      objective: 'STRENGTH',
      level: 'BEGINNER',
      daysPerWeek: 3,
    };

    expect(saveAthleteProfileSchema.parse(profile)).toMatchObject({
      macrocycleWeeks: 12,
      medicalClearance: 'PENDING',
      sleepTargetHours: 8,
      alarmSymptoms: false,
    });
    expect(saveAthleteProfileSchema.safeParse({ ...profile, daysPerWeek: 6 }).success).toBe(false);
    expect(saveAthleteProfileSchema.safeParse({ ...profile, macrocycleWeeks: 7 }).success).toBe(
      false,
    );
    expect(saveAthleteProfileSchema.safeParse({ ...profile, minutesPerSession: 20 }).success).toBe(
      false,
    );
  });

  it('RN-D09: el perfil y las pruebas rechazan los decimales que sus columnas no guardan', () => {
    const profile = { expectedRevision: 0, objective: 'HEALTH', level: 'BEGINNER', daysPerWeek: 3 };
    const accepts = (changes: object) =>
      saveAthleteProfileSchema.safeParse({ ...profile, ...changes }).success;

    expect(accepts({ baselineWeightKg: 70.12, baselineHrvMs: 45.5, sleepTargetHours: 7.5 })).toBe(
      true,
    );
    expect(accepts({ baselineWeightKg: 70.123 })).toBe(false);
    expect(accepts({ baselineHrvMs: 45.55 })).toBe(false);
    expect(accepts({ sleepTargetHours: 7.75 })).toBe(false);

    expect(savePhysicalResultSchema.safeParse({ value: 480.55 }).success).toBe(true);
    expect(savePhysicalResultSchema.safeParse({ value: 480.555 }).success).toBe(false);
  });
});
