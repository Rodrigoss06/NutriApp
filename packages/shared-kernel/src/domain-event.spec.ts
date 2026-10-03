import { describe, expect, it } from 'vitest';
import { createDomainEvent, type DomainEventContext, type EventType } from './domain-event.js';
import { asId, isUuidV7 } from './id.js';
import { FixedClock, SequentialIdGenerator } from './testing/index.js';

const organizationId = asId<'OrganizationId'>('01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e');
const evaluationId = asId<'EvaluationId'>('01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d70');

function context(): DomainEventContext {
  return { clock: new FixedClock('2026-10-01T15:30:00.000Z'), ids: new SequentialIdGenerator() };
}

const closed = {
  type: 'assessment.evaluation.closed',
  version: 1,
  organizationId,
  aggregateId: evaluationId,
  payload: { patientId: '01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d71', level: 'ISAK2' },
} as const;

describe('02 §5 y §8 · DomainEvent', () => {
  it('toma su id del IdGenerator (UUIDv7, ADR-003) y su instante del Clock', () => {
    const event = createDomainEvent(closed, context());

    expect(isUuidV7(event.eventId)).toBe(true);
    expect(event.occurredAt).toEqual(new Date('2026-10-01T15:30:00.000Z'));
  });

  it('lleva tipo contexto.agregado.hecho, versión, organización, agregado y payload', () => {
    const event = createDomainEvent(closed, context());

    expect(event).toMatchObject({
      type: 'assessment.evaluation.closed',
      version: 1,
      organizationId,
      aggregateId: evaluationId,
      payload: { level: 'ISAK2' },
    });
  });

  it('no se puede modificar, ni siquiera su payload', () => {
    const event = createDomainEvent(closed, context());

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
  });

  it.each(['EvaluationClosed', 'assessment.evaluation', 'Assessment.Evaluation.Closed'])(
    'rechaza el tipo %s porque no sigue contexto.agregado.hecho (06 §3)',
    (type) => {
      expect(() => createDomainEvent({ ...closed, type: type as EventType }, context())).toThrow(
        TypeError,
      );
    },
  );

  it.each([0, -1, 1.5])('rechaza la versión de esquema %s: es un entero desde 1', (version) => {
    expect(() => createDomainEvent({ ...closed, version }, context())).toThrow(RangeError);
  });
});
