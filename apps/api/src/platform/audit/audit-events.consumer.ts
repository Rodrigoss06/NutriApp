import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AUDIT_PORT,
  type ActorRole,
  type AuditAction,
  type AuditPort,
  type EventType,
  type Id,
  type OrganizationId,
  type PatientId,
  type UserId,
} from '@nutricoach/shared-kernel';
import { ConsumerRegistry, type EventConsumer } from '../events/event-consumer.js';
import type { OutboxEnvelope } from '../events/outbox-envelope.js';

interface AuditMapping {
  readonly action: AuditAction;
  readonly resourceType: string;
  /** Nombres de campo del cambio, nunca valores. */
  readonly fields?: (payload: Record<string, unknown>) => readonly string[];
}

const namesOf = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/**
 * Escrituras auditadas desde sus eventos (02 §10): invitaciones, roles, bajas, contraseñas, suscripciones, ajustes
 * y marca. Las lecturas, los ingresos y las sesiones se auditan en su caso de uso.
 */
export const AUDITED_EVENTS: Readonly<Record<string, AuditMapping>> = {
  'iam.invitation.created': { action: 'CREATE', resourceType: 'iam.invitation' },
  'iam.invitation.accepted': {
    action: 'UPDATE',
    resourceType: 'iam.invitation',
    fields: () => ['accepted_at'],
  },
  'iam.invitation.revoked': { action: 'REVOKE', resourceType: 'iam.invitation' },
  'iam.reset.requested': { action: 'CREATE', resourceType: 'iam.password_reset' },
  'iam.password.changed': {
    action: 'UPDATE',
    resourceType: 'iam.user_account',
    fields: () => ['password_hash'],
  },
  'tenancy.organization.created': { action: 'CREATE', resourceType: 'tenancy.organization' },
  'tenancy.organization.updated': {
    action: 'UPDATE',
    resourceType: 'tenancy.organization',
    fields: (p) => namesOf(p.fields),
  },
  'tenancy.member.added': {
    action: 'GRANT',
    resourceType: 'tenancy.member',
    fields: () => ['role'],
  },
  'tenancy.member.changed': {
    action: 'UPDATE',
    resourceType: 'tenancy.member',
    fields: (p) => namesOf(p.fields),
  },
  'tenancy.member.removed': { action: 'REVOKE', resourceType: 'tenancy.member' },
  'tenancy.subscription.changed': { action: 'CREATE', resourceType: 'tenancy.subscription' },
  'tenancy.subscription.expired': {
    action: 'UPDATE',
    resourceType: 'tenancy.subscription',
    fields: () => ['status'],
  },
  'clinical.patient.registered': { action: 'CREATE', resourceType: 'clinical.patient' },
  'clinical.patient.updated': {
    action: 'UPDATE',
    resourceType: 'clinical.patient',
    fields: (p) => namesOf(p.fields),
  },
  'clinical.patient.archived': {
    action: 'UPDATE',
    resourceType: 'clinical.patient',
    fields: () => ['status'],
  },
  'clinical.patient.reactivated': {
    action: 'UPDATE',
    resourceType: 'clinical.patient',
    fields: () => ['status'],
  },
  'clinical.careteam.changed': { action: 'UPDATE', resourceType: 'clinical.care_team_member' },
  'clinical.patient.linked': {
    action: 'UPDATE',
    resourceType: 'clinical.patient',
    fields: () => ['user_id'],
  },
  'clinical.consent.granted': { action: 'GRANT', resourceType: 'clinical.consent' },
  'clinical.consent.revoked': { action: 'REVOKE', resourceType: 'clinical.consent' },
  'clinical.history.revised': { action: 'CREATE', resourceType: 'clinical.clinical_history' },
  'clinical.condition.recorded': { action: 'CREATE', resourceType: 'clinical.condition' },
  'clinical.condition.changed': {
    action: 'UPDATE',
    resourceType: 'clinical.condition',
    fields: (p) => namesOf(p.fields),
  },
  'clinical.goal.recorded': { action: 'CREATE', resourceType: 'clinical.goal' },
  'clinical.goal.changed': {
    action: 'UPDATE',
    resourceType: 'clinical.goal',
    fields: (p) => namesOf(p.fields),
  },
  'clinical.note.written': { action: 'CREATE', resourceType: 'clinical.clinical_note' },
  'assessment.evaluation.created': { action: 'CREATE', resourceType: 'assessment.evaluation' },
  'assessment.evaluation.updated': {
    action: 'UPDATE',
    resourceType: 'assessment.evaluation',
    fields: (p) => namesOf(p.fields),
  },
  'assessment.measurement.recorded': {
    action: 'UPDATE',
    resourceType: 'assessment.measurement',
    fields: (p) => (typeof p.siteCode === 'string' ? [p.siteCode] : []),
  },
  'assessment.measurement.removed': {
    action: 'UPDATE',
    resourceType: 'assessment.measurement',
    fields: (p) => (typeof p.siteCode === 'string' ? [p.siteCode] : []),
  },
  'assessment.bia.recorded': { action: 'CREATE', resourceType: 'assessment.bia_reading' },
  'assessment.bia.removed': { action: 'UPDATE', resourceType: 'assessment.bia_reading' },
  'assessment.evaluation.closed': {
    action: 'UPDATE',
    resourceType: 'assessment.evaluation',
    fields: () => ['status'],
  },
  'assessment.evaluation.amended': {
    action: 'UPDATE',
    resourceType: 'assessment.evaluation',
    fields: () => ['status'],
  },
  'assessment.technicalerror.recorded': {
    action: 'CREATE',
    resourceType: 'assessment.evaluator_error',
    fields: (p) => namesOf(p.siteCodes),
  },
  'assessment.result.computed': {
    action: 'CREATE',
    resourceType: 'assessment.calculation_result',
  },
  'assessment.preference.changed': {
    action: 'UPDATE',
    resourceType: 'assessment.method_preference',
    fields: (p) => (typeof p.purpose === 'string' ? [p.purpose] : []),
  },
  'nutrition.prescription.created': {
    action: 'CREATE',
    resourceType: 'nutrition.energy_prescription',
  },
  'nutrition.plan.created': { action: 'CREATE', resourceType: 'nutrition.plan' },
  'nutrition.plan.updated': {
    action: 'UPDATE',
    resourceType: 'nutrition.plan',
    fields: (p) => namesOf(p.fields),
  },
  'nutrition.plan.published': { action: 'PUBLISH', resourceType: 'nutrition.plan' },
  'nutrition.exclusion.changed': {
    action: 'UPDATE',
    resourceType: 'nutrition.food_exclusion',
    fields: () => ['food_id'],
  },
  'nutrition.plan.superseded': {
    action: 'UPDATE',
    resourceType: 'nutrition.plan',
    fields: () => ['status'],
  },
  'food.food.created': { action: 'CREATE', resourceType: 'food.food' },
  'food.food.updated': {
    action: 'UPDATE',
    resourceType: 'food.food',
    fields: (p) => namesOf(p.fields),
  },
  'food.recipe.created': { action: 'CREATE', resourceType: 'food.recipe' },
  'food.recipe.updated': {
    action: 'UPDATE',
    resourceType: 'food.recipe',
    fields: (p) => namesOf(p.fields),
  },
  'food.recipe.archived': {
    action: 'UPDATE',
    resourceType: 'food.recipe',
    fields: () => ['status'],
  },
  'food.recipe.restored': {
    action: 'UPDATE',
    resourceType: 'food.recipe',
    fields: () => ['status'],
  },
  'exercise.exercise.created': { action: 'CREATE', resourceType: 'exercise.exercise' },
  'exercise.exercise.updated': {
    action: 'UPDATE',
    resourceType: 'exercise.exercise',
    fields: (p) => namesOf(p.fields),
  },
  'exercise.exercise.archived': {
    action: 'UPDATE',
    resourceType: 'exercise.exercise',
    fields: () => ['status'],
  },
  'exercise.exercise.restored': {
    action: 'UPDATE',
    resourceType: 'exercise.exercise',
    fields: () => ['status'],
  },
  'exercise.choice.changed': {
    action: 'UPDATE',
    resourceType: 'exercise.pattern_choice',
    fields: () => ['exercise_id'],
  },
  'documents.document.generated': {
    action: 'CREATE',
    resourceType: 'documents.generated_document',
  },
  'tenancy.setting.changed': {
    action: 'UPDATE',
    resourceType: 'tenancy.organization_setting',
    fields: (p) => (typeof p.key === 'string' ? [p.key] : []),
  },
  'tenancy.branding.changed': {
    action: 'UPDATE',
    resourceType: 'tenancy.branding',
    fields: (p) => namesOf(p.fields),
  },
};

/** El actor del evento (sus metadatos) y su organización; sin actor, SYSTEM. */
@Injectable()
export class AuditEventsConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'audit.events';
  readonly eventTypes = Object.keys(AUDITED_EVENTS) as EventType[];

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const mapping = AUDITED_EVENTS[event.type];
    if (!mapping) return;
    const payload = (
      typeof event.payload === 'object' && event.payload !== null ? event.payload : {}
    ) as Record<string, unknown>;
    const role: ActorRole = event.metadata.actorRole ?? 'SYSTEM';
    await this.audit.record(
      {
        organizationId: event.organizationId as OrganizationId | null,
        userId: (event.metadata.actorUserId ?? null) as UserId | null,
        role,
        patientId: null,
      },
      {
        action: mapping.action,
        resourceType: mapping.resourceType,
        resourceId: event.aggregateId as Id<string>,
        ...(typeof payload.patientId === 'string'
          ? { patientId: payload.patientId as PatientId }
          : {}),
        ...(mapping.fields ? { changedFields: mapping.fields(payload) } : {}),
      },
    );
  }
}
