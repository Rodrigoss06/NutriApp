export { AggregateRoot } from './aggregate-root.js';
export {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type EventId,
  type EventType,
  type NewDomainEvent,
} from './domain-event.js';
export { domainError, type DomainError, type ErrorCode, type RuleCode } from './domain-error.js';
export { Entity } from './entity.js';
export { asId, isUuidV7, type Id, type OrganizationId, type PatientId, type UserId } from './id.js';
export {
  AUDIT_ACTIONS,
  AUDIT_PORT,
  type AuditAction,
  type AuditEntry,
  type AuditPort,
} from './ports/audit.port.js';
export { CLOCK, type Clock } from './ports/clock.port.js';
export {
  ENCRYPTION_PORT,
  normalizeDocumentNumber,
  type EncryptionPort,
} from './ports/encryption.port.js';
export { ID_GENERATOR, type IdGenerator } from './ports/id-generator.port.js';
export { OUTBOX, type EventMetadata, type Outbox } from './ports/outbox.port.js';
export {
  ACTOR_ROLES,
  systemContext,
  UNIT_OF_WORK,
  type ActorRole,
  type SecurityContext,
  type UnitOfWork,
} from './ports/unit-of-work.port.js';
export { andThen, err, isErr, isOk, map, ok, type Err, type Ok, type Result } from './result.js';
export { cm, kcal, kg, ml, mm, type Cm, type Kcal, type Kg, type Ml, type Mm } from './units.js';
export { ValueObject } from './value-object.js';
