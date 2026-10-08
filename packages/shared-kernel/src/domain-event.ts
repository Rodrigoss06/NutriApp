import type { Id, OrganizationId } from './id.js';
import { frozenCopy } from './immutable.js';
import type { Clock } from './ports/clock.port.js';
import type { IdGenerator } from './ports/id-generator.port.js';

/** Nombre de evento `contexto.agregado.hecho`, en pasado: `assessment.evaluation.closed` (06 §3). */
export type EventType = `${string}.${string}.${string}`;

export type EventId = Id<'EventId'>;

/**
 * Hecho de dominio (02 §5 y §8). El payload lleva identificadores y lo mínimo necesario: nunca
 * nombres, documentos ni datos de contacto.
 */
export interface DomainEvent<TType extends EventType = EventType, TPayload = unknown> {
  readonly eventId: EventId;
  readonly type: TType;
  /** Versión del esquema del payload, desde 1. */
  readonly version: number;
  readonly occurredAt: Date;
  /** null en los hechos de la plataforma que no son de una organización (cuentas de iam). */
  readonly organizationId: OrganizationId | null;
  readonly aggregateId: string;
  readonly payload: TPayload;
}

export type NewDomainEvent<TType extends EventType, TPayload> = Omit<
  DomainEvent<TType, TPayload>,
  'eventId' | 'occurredAt'
>;

/** Puertos que ponen la identidad y el instante del evento. */
export interface DomainEventContext {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const EVENT_TYPE = /^[a-z]+\.[a-z]+\.[a-z]+$/;

export function createDomainEvent<TType extends EventType, TPayload>(
  event: NewDomainEvent<TType, TPayload>,
  { clock, ids }: DomainEventContext,
): DomainEvent<TType, TPayload> {
  if (!EVENT_TYPE.test(event.type)) {
    throw new TypeError(
      `Tipo de evento «${event.type}» inválido: se espera contexto.agregado.hecho.`,
    );
  }
  if (!Number.isInteger(event.version) || event.version < 1) {
    throw new RangeError(`Versión de esquema inválida en «${event.type}»: es un entero desde 1.`);
  }
  return Object.freeze({
    eventId: ids.newId<'EventId'>(),
    type: event.type,
    version: event.version,
    occurredAt: clock.now(),
    organizationId: event.organizationId,
    aggregateId: event.aggregateId,
    payload: frozenCopy(event.payload),
  });
}
