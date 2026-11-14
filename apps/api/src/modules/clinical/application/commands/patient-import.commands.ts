import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ENCRYPTION_PORT,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type EncryptionPort,
  type IdGenerator,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically, ImportRecordStore, type ImportOrigin } from '../../../../platform/index.js';
import {
  CONSENT_DOCUMENT_NOT_CURRENT,
  normalizeDocument,
  RESPONSIBLE_NOT_MEMBER,
} from '../../domain/clinical-rules.js';
import { migratedConsentOf, noonUtcOf, type MigratedConsent } from '../../domain/patient-import.js';
import { clinicalEvent } from '../clinical-events.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientStore,
} from '../ports/clinical.ports.js';
import {
  actorOf,
  documentAad,
  PatientCommands,
  phoneAad,
  type PatientInput,
} from './patient.commands.js';

export interface PatientImportInput {
  readonly origin: ImportOrigin;
  readonly patient: Omit<PatientInput, 'responsibleMemberId'>;
  /** false: estaba inactivo en el sistema anterior y entra archivado, sin ocupar cupo (RN-A03). */
  readonly active: boolean;
  /** AAAA-MM-DD: cuándo consintió el tratamiento de sus datos de salud en el sistema anterior; null si no consta. */
  readonly healthDataConsentDate: string | null;
}

export interface PatientImportOutcome {
  readonly id: string;
  /** false: la fila ya había entrado y no se tocó nada. */
  readonly created: boolean;
  /** Qué pasó con su consentimiento de datos de salud; null si la fila ya había entrado. */
  readonly healthData: MigratedConsent | null;
}

/**
 * La importación de un paciente de una cuenta del sistema anterior (RF-40, RN-I05; ADR-135), en una transacción: el alta de siempre,
 * con el nutricionista de la cuenta como responsable, el consentimiento de datos de salud migrado con su fecha y la fila en
 * platform.import_record. Si la fila ya entró, devuelve el mismo paciente sin tocar nada.
 */
@Injectable()
export class PatientImportCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort,
    private readonly records: ImportRecordStore,
    private readonly registration: PatientCommands,
  ) {}

  importPatient(
    context: SecurityContext,
    input: PatientImportInput,
  ): Promise<Result<PatientImportOutcome, DomainError>> {
    const actor = actorOf(context);
    return atomically<PatientImportOutcome>(this.uow, context, async () => {
      if (actor.memberId !== input.origin.accountMemberId) return err(RESPONSIBLE_NOT_MEMBER);
      const existing = await this.records.find(actor.organizationId, 'PATIENT', input.origin);
      if (existing) return ok({ id: existing, created: false, healthData: null });
      const healthData = migratedConsentOf(input.patient.birthDate, input.healthDataConsentDate);
      const registered = await this.registration.registerWithin(
        context,
        { ...input.patient, responsibleMemberId: input.origin.accountMemberId },
        { healthDataInTransaction: healthData === 'MIGRATED', archived: !input.active },
      );
      if (!registered.ok) return registered;
      const patientId = registered.value.id;
      if (healthData === 'MIGRATED' && input.healthDataConsentDate) {
        const document = (await this.consents.currentDocuments()).find(
          (d) => d.purpose === 'HEALTH_DATA',
        );
        if (!document) return err(CONSENT_DOCUMENT_NOT_CURRENT);
        const consentId = this.ids.newId<'ConsentId'>();
        await this.consents.insert({
          id: consentId,
          organizationId: actor.organizationId,
          patientId,
          purpose: 'HEALTH_DATA',
          consentDocumentId: document.id,
          channel: 'MIGRATED',
          grantedAt: noonUtcOf(input.healthDataConsentDate),
          evidenceFileId: null,
          grantedByUserId: actor.userId,
          ip: null,
          userAgent: null,
        });
        await this.outbox.append(
          [
            clinicalEvent(
              'clinical.consent.granted',
              actor.organizationId,
              consentId,
              { patientId, purpose: 'HEALTH_DATA' },
              { clock: this.clock, ids: this.ids },
            ),
          ],
          { actorUserId: actor.userId, actorRole: context.role },
        );
      }
      await this.records.insert(actor.organizationId, 'PATIENT', input.origin, patientId);
      return ok({ id: patientId, created: true, healthData });
    });
  }

  /**
   * El muestreo del informe (RN-I05): vuelve a leer al paciente importado y devuelve los campos que no coinciden con su fila de
   * origen, sin sus valores. Es parte de la importación: no la hace una persona y no se audita como lectura.
   */
  verify(
    context: SecurityContext,
    patientId: string,
    input: PatientImportInput,
  ): Promise<readonly string[]> {
    return this.uow.query(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return ['paciente'];
      const source = input.patient;
      const document = source.document
        ? normalizeDocument(source.document.type, source.document.number)
        : null;
      const storedDocument = patient.documentNumberEnc
        ? this.encryption.decrypt(patient.documentNumberEnc, documentAad(patientId))
        : null;
      const storedPhone = patient.phoneEnc
        ? this.encryption.decrypt(patient.phoneEnc, phoneAad(patientId))
        : null;
      const consent = await this.consents.active(patientId, 'HEALTH_DATA');
      const migrated = migratedConsentOf(source.birthDate, input.healthDataConsentDate);
      const checks: readonly [string, boolean][] = [
        ['nombres', patient.firstName === source.firstName],
        ['apellidos', patient.lastName === source.lastName],
        ['sexo', patient.sex === source.sex],
        ['fecha_nacimiento', patient.birthDate === source.birthDate],
        ['tipo_documento', patient.documentType === (source.document?.type ?? null)],
        ['numero_documento', storedDocument === document],
        ['telefono', storedPhone === (source.phone ?? null)],
        [
          'correo',
          (patient.email ?? null)?.toLowerCase() === (source.email ?? null)?.toLowerCase(),
        ],
        ['poblacion', patient.population === source.population],
        ['activo', (patient.status === 'ACTIVE') === input.active],
        ['responsable', patient.responsibleMemberId === input.origin.accountMemberId],
        [
          'consentimiento_datos_salud',
          migrated === 'MIGRATED'
            ? consent?.channel === 'MIGRATED' &&
              consent.grantedAt.getTime() === noonUtcOf(input.healthDataConsentDate ?? '').getTime()
            : consent === null,
        ],
      ];
      return checks.filter(([, same]) => !same).map(([field]) => field);
    });
  }
}
