import { describe, expect, it } from 'vitest';
import {
  CRITICAL_SCREENING_QUESTIONS,
  isPrescriptionBlocked,
  movementTestStatus,
  prescriptionStatus,
  REVIEW_SCREENING_QUESTIONS,
  screeningStatus,
  type SafetyKeys,
} from './safety.js';

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

describe('RN-F15 · cribado: una sola respuesta basta, no se promedia', () => {
  it.each(CRITICAL_SCREENING_QUESTIONS)('%s Sí es rojo', (code) => {
    expect(screeningStatus({ ...allNo, [code]: true })).toBe('RED');
  });

  it.each(REVIEW_SCREENING_QUESTIONS)('%s Sí es ámbar', (code) => {
    expect(screeningStatus({ ...allNo, [code]: true })).toBe('AMBER');
  });

  it('una crítica y una de revisión son rojo', () => {
    expect(screeningStatus({ ...allNo, S01: true, S05: true })).toBe('RED');
  });
});

describe('RN-F15 · estado de una prueba postural', () => {
  const score = (rightScore: number | null, leftScore: number | null) => ({
    rightScore,
    leftScore,
    pain: false,
    asymmetry: false,
  });

  it('P-14: el dolor manda aunque falte un lado', () => {
    expect(movementTestStatus({ ...score(null, 2), pain: true })).toBe('REFER');
    expect(movementTestStatus({ ...score(null, null), pain: true })).toBe('REFER');
  });

  it('sin el puntaje de un lado queda pendiente, también con asimetría', () => {
    expect(movementTestStatus(score(null, null))).toBe('PENDING');
    expect(movementTestStatus({ ...score(null, 2), asymmetry: true })).toBe('PENDING');
  });

  it('un 0 pide modificar, aunque el otro lado sea 1 o haya asimetría', () => {
    expect(movementTestStatus(score(1, 0))).toBe('MODIFY');
    expect(movementTestStatus({ ...score(0, 2), asymmetry: true })).toBe('MODIFY');
  });

  it('2 y 2 sin dolor ni asimetría es apto', () => {
    expect(movementTestStatus(score(2, 2))).toBe('FIT');
  });

  it('1 y 1 es precaución', () => {
    expect(movementTestStatus(score(1, 1))).toBe('CAUTION');
  });
});

describe('RN-F15 · las tres llaves, en orden', () => {
  const open: SafetyKeys = {
    medicalClearance: 'CLEARED',
    alarmSymptoms: false,
    movementStatuses: ['FIT', 'CAUTION'],
    screening: { status: 'GREEN', reviewDecision: null },
  };

  it('«no requerida» abre la llave del alta igual que «apto»', () => {
    expect(prescriptionStatus({ ...open, medicalClearance: 'NOT_REQUIRED' })).toBe(
      'PENDING_APPROVAL',
    );
  });

  it('los síntomas de alarma que registra el coach bloquean como el dolor (07 §3.3)', () => {
    expect(prescriptionStatus({ ...open, alarmSymptoms: true })).toBe('BLOCKED_PAIN');
  });

  it('el dolor pasa antes que el cribado', () => {
    expect(
      prescriptionStatus({
        ...open,
        movementStatuses: ['REFER'],
        screening: { status: 'RED', reviewDecision: null },
      }),
    ).toBe('BLOCKED_PAIN');
  });

  it('solo el dolor bloquea: pendiente, modificar y precaución no', () => {
    expect(
      prescriptionStatus({ ...open, movementStatuses: ['PENDING', 'MODIFY', 'CAUTION'] }),
    ).toBe('PENDING_APPROVAL');
  });

  it('sin evaluación postural no bloquea, como la V3', () => {
    expect(prescriptionStatus({ ...open, movementStatuses: [] })).toBe('PENDING_APPROVAL');
  });

  it('sin cribado respondido bloquea', () => {
    expect(prescriptionStatus({ ...open, screening: null })).toBe('BLOCKED_SCREENING');
  });

  it.each(['RED', 'AMBER'] as const)('un cribado %s sin revisar bloquea', (status) => {
    expect(prescriptionStatus({ ...open, screening: { status, reviewDecision: null } })).toBe(
      'BLOCKED_SCREENING',
    );
  });

  it.each(['RED', 'AMBER'] as const)(
    'un cribado %s con «iniciar» o «limitar» abre la llave',
    (status) => {
      for (const reviewDecision of ['START', 'LIMIT'] as const) {
        expect(prescriptionStatus({ ...open, screening: { status, reviewDecision } })).toBe(
          'PENDING_APPROVAL',
        );
      }
    },
  );

  it('con la revisión «derivar» sigue bloqueado', () => {
    expect(
      prescriptionStatus({ ...open, screening: { status: 'RED', reviewDecision: 'REFER' } }),
    ).toBe('BLOCKED_REFERRED');
  });

  it('aprobada solo con las tres llaves abiertas y todos sus ejercicios aprobados (RN-F14)', () => {
    expect(prescriptionStatus(open, true)).toBe('APPROVED');
    expect(prescriptionStatus({ ...open, alarmSymptoms: true }, true)).toBe('BLOCKED_PAIN');
  });

  it('dice si alguna llave sigue cerrada', () => {
    expect(isPrescriptionBlocked('BLOCKED_CLEARANCE')).toBe(true);
    expect(isPrescriptionBlocked('BLOCKED_PAIN')).toBe(true);
    expect(isPrescriptionBlocked('BLOCKED_SCREENING')).toBe(true);
    expect(isPrescriptionBlocked('BLOCKED_REFERRED')).toBe(true);
    expect(isPrescriptionBlocked('PENDING_APPROVAL')).toBe(false);
    expect(isPrescriptionBlocked('APPROVED')).toBe(false);
  });
});
