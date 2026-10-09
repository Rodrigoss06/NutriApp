import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import {
  canWriteClinical,
  checkGrant,
  CONSENT_DOCUMENT_NOT_CURRENT,
  CONSENT_NOT_FOUND,
  isMinor,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  UNSUPPORTED_EVIDENCE,
  WRITE_ACCESS_REQUIRED,
  type ConsentChannel,
} from '../../domain/clinical-rules.js';
import { atomically } from '../atomically.js';
import { clinicalEvent } from '../clinical-events.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientStore,
} from '../ports/clinical.ports.js';
import { localToday } from '../local-today.js';
import { actorOf } from './patient.commands.js';

export interface GrantInput {
  readonly consentDocumentId: string;
  readonly channel: Exclude<ConsentChannel, 'APP'>;
  /** Escaneo del papel (o constancia), ya acotado a 5 MB por el parser. */
  readonly evidence: Uint8Array | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/**
 * Consentimiento informado (RF-05, RN-B01, RN-B02): se otorga con el texto vigente y su evidencia, y se revoca. La
 * evidencia y el consentimiento van en un solo pedido: los bytes se escriben antes de la transacción y se descartan si
 * esta falla, para no dejar archivos huérfanos. La evidencia de un consentimiento nunca se borra.
 */
@Injectable()
export class ConsentCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    private readonly files: FileRegistry,
  ) {}

  async grant(
    context: SecurityContext,
    patientId: string,
    input: GrantInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    const file = input.evidence
      ? await this.files.write(actor.organizationId, input.evidence)
      : null;
    if (input.evidence && !file) return err(UNSUPPORTED_EVIDENCE);
    const now = this.clock.now();
    try {
      const result = await atomically(this.uow, context, async () => {
        const patient = await this.patients.find(patientId);
        if (!patient) return err(PATIENT_NOT_FOUND);
        if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
        if (!canWriteClinical(actor, await this.patients.careTeam(patientId)))
          return err(WRITE_ACCESS_REQUIRED);
        const document = (await this.consents.currentDocuments()).find(
          (d) => d.id === input.consentDocumentId,
        );
        if (!document) return err(CONSENT_DOCUMENT_NOT_CURRENT);
        const rule = checkGrant({
          channel: input.channel,
          hasEvidence: file !== null,
          minor: isMinor(patient.birthDate, localToday(now, patient.timezone)),
          alreadyActive: (await this.consents.active(patientId, document.purpose)) !== null,
        });
        if (rule) return err(rule);
        if (file && input.evidence) {
          await this.files.register({
            ...file,
            sizeBytes: input.evidence.byteLength,
            organizationId: actor.organizationId,
            purpose: 'CONSENT_EVIDENCE',
            uploadedBy: actor.userId,
          });
        }
        const id = this.ids.newId<'ConsentId'>();
        await this.consents.insert({
          id,
          organizationId: actor.organizationId,
          patientId,
          purpose: document.purpose,
          consentDocumentId: document.id,
          channel: input.channel,
          grantedAt: now,
          evidenceFileId: file?.id ?? null,
          grantedByUserId: actor.userId,
          ip: input.ip,
          userAgent: input.userAgent,
        });
        await this.#emit(context, 'clinical.consent.granted', id, {
          patientId,
          purpose: document.purpose,
        });
        return ok({ id });
      });
      if (!result.ok && file) await this.files.discard(file.key);
      return result;
    } catch (error) {
      if (file) await this.files.discard(file.key);
      throw error;
    }
  }

  /** Revocar bloquea registros nuevos (RN-B02); con APP_ACCESS o HEALTH_DATA, iam cierra las sesiones del paciente. */
  revoke(
    context: SecurityContext,
    patientId: string,
    consentId: string,
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      if (!canWriteClinical(actor, await this.patients.careTeam(patientId)))
        return err(WRITE_ACCESS_REQUIRED);
      const consent = (await this.consents.list(patientId)).find((c) => c.id === consentId);
      if (!consent || consent.revokedAt) return err(CONSENT_NOT_FOUND);
      if (!(await this.consents.revoke(consentId, this.clock.now()))) return err(CONSENT_NOT_FOUND);
      await this.#emit(context, 'clinical.consent.revoked', consentId, {
        patientId,
        purpose: consent.purpose,
        userId: patient.userId,
      });
      return ok(undefined);
    });
  }

  async #emit(
    context: SecurityContext,
    type: 'clinical.consent.granted' | 'clinical.consent.revoked',
    consentId: string,
    payload: { patientId: string } & Record<string, unknown>,
  ): Promise<void> {
    const actor = actorOf(context);
    await this.outbox.append(
      [
        clinicalEvent(type, actor.organizationId, consentId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: actor.userId, actorRole: context.role },
    );
  }
}
