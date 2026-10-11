import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Outbox,
  type Result,
  type UserId,
} from '@nutricoach/shared-kernel';
import type {
  ConsentText,
  PatientAccessPurpose,
  PatientEnrollment,
  PatientInvitationPreview,
} from '../../iam/index.js';
import {
  checkAppEnrollment,
  isMinor,
  PATIENT_ALREADY_LINKED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  pendingAppPurposes,
} from '../domain/clinical-rules.js';
import { clinicalEvent } from './clinical-events.js';
import { localToday } from './local-today.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientStore,
} from './ports/clinical.ports.js';

/**
 * clinical implementa el puerto PATIENT_ENROLLMENT de iam (sin ciclos: iam no importa clinical, 02 §4). Vincula la
 * cuenta de la app al paciente y registra, con canal APP, los consentimientos que la persona aceptó (RN-A06, RN-B01).
 */
@Injectable()
export class PatientEnrollmentService implements PatientEnrollment {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
  ) {}

  async preview(tokenHash: Uint8Array): Promise<PatientInvitationPreview | null> {
    const row = await this.patients.previewInvitation(tokenHash);
    if (!row) return null;
    return {
      patientId: row.patientId,
      organizationId: row.organizationId,
      firstName: row.firstName,
      minor: isMinor(row.birthDate, localToday(this.clock.now(), row.timezone)),
      linked: row.linked,
      active: row.status === 'ACTIVE',
      pendingPurposes: pendingAppPurposes(row.activePurposes) as PatientAccessPurpose[],
    };
  }

  async consentTexts(purposes: readonly PatientAccessPurpose[]): Promise<readonly ConsentText[]> {
    const documents = await this.consents.currentDocuments();
    return purposes.flatMap((purpose) => {
      const document = documents.find((d) => d.purpose === purpose);
      return document
        ? [
            {
              id: document.id,
              purpose,
              version: document.version,
              bodyMarkdown: document.bodyMarkdown,
            },
          ]
        : [];
    });
  }

  /**
   * Dentro de la transacción de aceptación (rol ACCOUNT): el paciente activo y sin cuenta queda vinculado, y se
   * registran las finalidades pendientes que la persona aceptó, cada una con su texto vigente. Todo o nada.
   */
  async enroll(
    input: {
      patientId: string;
      userId: UserId;
      acceptedConsentDocumentIds: readonly string[];
      ip: string | null;
      userAgent: string | null;
    },
    metadata: { actorUserId: UserId; actorRole: 'ACCOUNT' },
  ): Promise<Result<void, DomainError>> {
    const now = this.clock.now();
    const patient = await this.patients.find(input.patientId);
    if (!patient) return err(PATIENT_NOT_FOUND);
    if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
    if (patient.userId) return err(PATIENT_ALREADY_LINKED);
    const active = (await this.consents.list(patient.id))
      .filter((c) => c.revokedAt === null)
      .map((c) => c.purpose);
    const pending = pendingAppPurposes(active);
    const documents = (await this.consents.currentDocuments()).filter(
      (d) => pending.includes(d.purpose) && input.acceptedConsentDocumentIds.includes(d.id),
    );
    const rule = checkAppEnrollment({
      pending,
      accepted: documents.map((d) => d.purpose),
      minor: isMinor(patient.birthDate, localToday(now, patient.timezone)),
    });
    if (rule) return err(rule);
    if (!(await this.patients.linkAccount(patient.id, input.userId)))
      return err(PATIENT_ALREADY_LINKED);
    const context = { clock: this.clock, ids: this.ids };
    for (const document of documents) {
      const consentId = this.ids.newId<'ConsentId'>();
      await this.consents.insert({
        id: consentId,
        organizationId: patient.organizationId,
        patientId: patient.id,
        purpose: document.purpose,
        consentDocumentId: document.id,
        channel: 'APP',
        grantedAt: now,
        evidenceFileId: null,
        grantedByUserId: input.userId,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      await this.outbox.append(
        [
          clinicalEvent(
            'clinical.consent.granted',
            patient.organizationId,
            consentId,
            { patientId: patient.id, purpose: document.purpose },
            context,
          ),
        ],
        metadata,
      );
    }
    await this.outbox.append(
      [
        clinicalEvent(
          'clinical.patient.linked',
          patient.organizationId,
          patient.id,
          { patientId: patient.id },
          context,
        ),
      ],
      metadata,
    );
    return ok(undefined);
  }

  patientOfAccount() {
    return this.patients.patientOfAccount();
  }
}
