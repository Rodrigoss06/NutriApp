import { describe, expect, it } from 'vitest';
import { AggregateRoot } from './aggregate-root.js';
import { createDomainEvent, type DomainEventContext } from './domain-event.js';
import { asId, type Id, type OrganizationId } from './id.js';
import { FixedClock, SequentialIdGenerator } from './testing/index.js';

type EvaluationId = Id<'EvaluationId'>;

class Evaluation extends AggregateRoot<EvaluationId> {
  private constructor(
    id: EvaluationId,
    private readonly organizationId: OrganizationId,
    version?: number,
  ) {
    super(id, version);
  }

  static open(id: EvaluationId, organizationId: OrganizationId, ctx: DomainEventContext) {
    const evaluation = new Evaluation(id, organizationId);
    evaluation.record('assessment.evaluation.opened', ctx);
    return evaluation;
  }

  static reconstitute(id: EvaluationId, organizationId: OrganizationId, version: number) {
    return new Evaluation(id, organizationId, version);
  }

  close(ctx: DomainEventContext): void {
    this.record('assessment.evaluation.closed', ctx);
  }

  private record(type: `assessment.evaluation.${string}`, ctx: DomainEventContext): void {
    this.addDomainEvent(
      createDomainEvent(
        {
          type,
          version: 1,
          organizationId: this.organizationId,
          aggregateId: this.id,
          payload: {},
        },
        ctx,
      ),
    );
  }
}

const id = asId<'EvaluationId'>('01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d70');
const organizationId = asId<'OrganizationId'>('01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e');
const ctx = (): DomainEventContext => ({
  clock: new FixedClock(),
  ids: new SequentialIdGenerator(),
});

describe('02 §5 · AggregateRoot: acumula eventos y lleva version para el bloqueo optimista', () => {
  it('un agregado nuevo empieza en version 0, como la columna version de 05.1', () => {
    expect(Evaluation.open(id, organizationId, ctx()).version).toBe(0);
  });

  it('al reconstruirse conserva la version guardada, la que se compara con If-Match (06 §5)', () => {
    expect(Evaluation.reconstitute(id, organizationId, 7).version).toBe(7);
  });

  it.each([-1, 1.5, Number.NaN])('rechaza la version %s', (version) => {
    expect(() => Evaluation.reconstitute(id, organizationId, version)).toThrow(RangeError);
  });

  it('acumula los eventos en el orden en que ocurren', () => {
    const evaluation = Evaluation.open(id, organizationId, ctx());
    evaluation.close(ctx());

    expect(evaluation.pullDomainEvents().map((event) => event.type)).toEqual([
      'assessment.evaluation.opened',
      'assessment.evaluation.closed',
    ]);
  });

  it('pullDomainEvents entrega los pendientes una sola vez: van al outbox en la misma transacción (02 §6)', () => {
    const evaluation = Evaluation.open(id, organizationId, ctx());

    expect(evaluation.pullDomainEvents()).toHaveLength(1);
    expect(evaluation.pullDomainEvents()).toEqual([]);
  });

  it('la lista entregada no permite tocar los eventos del agregado', () => {
    const evaluation = Evaluation.reconstitute(id, organizationId, 3);
    evaluation.close(ctx());
    const events = evaluation.pullDomainEvents();

    expect(Object.isFrozen(events)).toBe(true);
    expect(evaluation.pullDomainEvents()).toEqual([]);
  });
});
