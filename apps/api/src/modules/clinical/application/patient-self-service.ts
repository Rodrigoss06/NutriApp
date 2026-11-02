import { Inject, Injectable } from '@nestjs/common';
import { SAFETY_RULE_VERSION, SCREENING_FORM_VERSION, screeningStatus } from '@nutricoach/engine';
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
import { atomically } from '../../../platform/index.js';
import {
  checkGrant,
  CONSENT_DOCUMENT_NOT_CURRENT,
  CONSENT_NOT_FOUND,
  HEALTH_DATA_REQUIRED,
  needsGuardian,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  SELF_SERVICE_PURPOSES,
  type ConsentPurpose,
} from '../domain/clinical-rules.js';
import { clinicalEvent, type ClinicalEventType } from './clinical-events.js';
import { localToday } from './local-today.js';
import {
  CLINICAL_RECORD_STORE,
  CONSENT_STORE,
  PATIENT_STORE,
  type ClinicalRecordStore,
  type ConsentStore,
  type PatientStore,
} from './ports/clinical.ports.js';
import { actorOf } from './commands/patient.commands.js';

export type SelfServicePurpose = (typeof SELF_SERVICE_PURPOSES)[number];

export interface SelfConsentView {
  readonly purpose: SelfServicePurpose;
  readonly active: boolean;
  readonly grantedAt: Date | null;
  readonly document: {
    readonly id: string;
    readonly version: string;
    readonly bodyMarkdown: string;
  } | null;
}

export type ScreeningAnswers = Readonly<
  Record<'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08', boolean>
> &
  Readonly<{ S09?: string | undefined }>;

/**
 * Lo que el paciente hace sobre su propio expediente desde la app (02 §10): autorizar o retirar las finalidades opcionales, como
 * MENSTRUAL_TRACKING (RN-G17), y responder su cribado previo al ejercicio (07 §3.2, ADR-075). El paciente sale de la sesión.
 */
@Injectable()
export class PatientSelfService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    @Inject(CLINICAL_RECORD_STORE) private readonly records: ClinicalRecordStore,
  ) {}

  myConsents(context: SecurityContext): Promise<readonly SelfConsentView[]> {
    const patientId = patientOf(context);
    return this.uow.query(context, async () => {
      const documents = await this.consents.currentDocuments();
      return Promise.all(
        SELF_SERVICE_PURPOSES.map(async (purpose) => {
          const active = await this.consents.active(patientId, purpose);
          const document = documents.find((d) => d.purpose === purpose) ?? null;
          return {
            purpose,
            active: active !== null,
            grantedAt: active?.grantedAt ?? null,
            document: document
              ? { id: document.id, version: document.version, bodyMarkdown: document.bodyMarkdown }
              : null,
          };
        }),
      );
    });
  }

  /** Autorizar desde la app (canal APP): con el texto vigente; un menor de 14 solo en papel firmado (ADR-042). */
  grant(
    context: SecurityContext,
    purpose: SelfServicePurpose,
    meta: { readonly ip: string | null; readonly userAgent: string | null },
  ): Promise<Result<{ id: string }, DomainError>> {
    const patientId = patientOf(context);
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
      const document = (await this.consents.currentDocuments()).find((d) => d.purpose === purpose);
      if (!document) return err(CONSENT_DOCUMENT_NOT_CURRENT);
      const now = this.clock.now();
      const rule = checkGrant({
        channel: 'APP',
        hasEvidence: false,
        needsGuardian: needsGuardian(patient.birthDate, localToday(now, patient.timezone)),
        alreadyActive: (await this.consents.active(patientId, purpose)) !== null,
      });
      if (rule) return err(rule);
      const id = this.ids.newId<'ConsentId'>();
      await this.consents.insert({
        id,
        organizationId: actor.organizationId,
        patientId,
        purpose,
        consentDocumentId: document.id,
        channel: 'APP',
        grantedAt: now,
        evidenceFileId: null,
        grantedByUserId: actor.userId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await this.#emit(context, 'clinical.consent.granted', id, { patientId, purpose });
      return ok({ id });
    });
  }

  /** Retirar la autorización: bloquea registros nuevos de esa finalidad; lo ya registrado se conserva (RN-B02). */
  revoke(
    context: SecurityContext,
    purpose: SelfServicePurpose,
  ): Promise<Result<void, DomainError>> {
    const patientId = patientOf(context);
    return this.uow.run(context, async () => {
      const active = await this.consents.active(patientId, purpose);
      if (!active || !(await this.consents.revoke(active.id, this.clock.now()))) {
        return err(CONSENT_NOT_FOUND);
      }
      await this.#emit(context, 'clinical.consent.revoked', active.id, {
        patientId,
        purpose: purpose satisfies ConsentPurpose,
        userId: context.userId,
      });
      return ok(undefined);
    });
  }

  /** El último cribado: cuándo lo respondió y si espera la revisión del coach (rojo o ámbar sin decisión, RN-F15). */
  screening(
    context: SecurityContext,
  ): Promise<{ readonly answeredAt: Date; readonly awaitingReview: boolean } | null> {
    const patientId = patientOf(context);
    return this.uow.query(context, async () => {
      const [latest] = await this.records.screenings(patientId);
      return latest
        ? {
            answeredAt: latest.answeredAt,
            awaitingReview: latest.status !== 'GREEN' && !latest.review,
          }
        : null;
    });
  }

  /** Responder el cribado (07 §3.2): una fila nueva, que manda sobre las anteriores; rojo o ámbar espera al coach (RN-F15). */
  answerScreening(
    context: SecurityContext,
    answers: ScreeningAnswers,
  ): Promise<Result<{ id: string }, DomainError>> {
    const patientId = patientOf(context);
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
      if (!(await this.consents.active(patientId, 'HEALTH_DATA'))) return err(HEALTH_DATA_REQUIRED);
      const id = this.ids.newId<'ScreeningId'>();
      await this.records.insertScreening({
        id,
        organizationId: actor.organizationId,
        patientId,
        formVersion: SCREENING_FORM_VERSION,
        ruleVersion: SAFETY_RULE_VERSION,
        answers: { ...answers },
        status: screeningStatus(answers),
        answeredBy: actor.userId,
        answeredAt: this.clock.now(),
        review: null,
      });
      await this.#emit(context, 'clinical.screening.recorded', id, { patientId });
      return ok({ id });
    });
  }

  async #emit(
    context: SecurityContext,
    type: ClinicalEventType,
    aggregateId: string,
    payload: { readonly patientId: string } & Record<string, unknown>,
  ): Promise<void> {
    const actor = actorOf(context);
    await this.outbox.append(
      [
        clinicalEvent(type, actor.organizationId, aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: actor.userId, actorRole: context.role },
    );
  }
}

function patientOf(context: SecurityContext): string {
  if (!context.patientId) throw new Error('Este caso de uso es del paciente de la sesión.');
  return context.patientId;
}
