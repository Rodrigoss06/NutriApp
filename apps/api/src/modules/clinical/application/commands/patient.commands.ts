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
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { TenancyApi } from '../../../tenancy/index.js';
import {
  ALREADY_IN_STATUS,
  canManagePatient,
  canWriteClinical,
  CANNOT_REMOVE_RESPONSIBLE,
  checkPopulation,
  DOCUMENT_TAKEN,
  INVALID_DOCUMENT,
  normalizeDocument,
  NOT_RESPONSIBLE,
  PATIENT_NOT_FOUND,
  patientCode,
  RESPONSIBLE_NOT_MEMBER,
  VERSION_CONFLICT,
  WRITE_ACCESS_REQUIRED,
  type ActorRole,
  type CareTeamAccess,
  type CareTeamRole,
  type DocumentType,
  type Population,
  type Sex,
} from '../../domain/clinical-rules.js';
import { atomically } from '../atomically.js';
import { clinicalEvent, type ClinicalEventType } from '../clinical-events.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientChanges,
  type PatientRecord,
  type PatientStore,
} from '../ports/clinical.ports.js';

export interface PatientInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly sex: Sex;
  readonly birthDate: string;
  readonly document?: { type: DocumentType; number: string } | null | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly population: Population;
  readonly responsibleMemberId?: string | undefined;
}

export type PatientUpdate = Partial<Omit<PatientInput, 'responsibleMemberId'>> & {
  readonly responsibleMemberId?: string;
};

/** Datos asociados del cifrado: atan el valor a su paciente y a su campo (ADR-025). */
export const documentAad = (patientId: string) => `clinical.patient.document:${patientId}`;
export const phoneAad = (patientId: string) => `clinical.patient.phone:${patientId}`;

/** Quien actúa, tal como lo dejó TenantGuard (RN-A04, RN-A05). */
export function actorOf(context: SecurityContext): {
  organizationId: OrganizationId;
  userId: UserId;
  role: ActorRole;
  memberId: string | null;
} {
  if (!context.organizationId || !context.userId)
    throw new Error('Caso de uso clínico sin organización activa.');
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    role: context.role as ActorRole,
    memberId: context.memberId ?? null,
  };
}

/**
 * Pacientes (RF-08): alta con datos mínimos, ficha, archivo y equipo de atención. Documento y teléfono cifrados con
 * índice ciego del documento (RN-B06); cupo con la QuotaPolicy de tenancy (RN-A03); RLS del equipo (RN-A05).
 */
@Injectable()
export class PatientCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    private readonly tenancy: TenancyApi,
  ) {}

  register(
    context: SecurityContext,
    input: PatientInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    // Recién creado no tiene consentimiento: OBESITY nunca entra en el alta (RN-B01).
    const population = checkPopulation(input.population, false);
    if (population) return Promise.resolve(err(population));
    const id = this.ids.newId<'PatientId'>();
    const document = this.#document(actor.organizationId, id, input.document);
    if (document === 'INVALID') return Promise.resolve(err(INVALID_DOCUMENT));

    return this.uow.run(context, async () => {
      const responsibleMemberId = input.responsibleMemberId ?? actor.memberId;
      if (
        !responsibleMemberId ||
        !(await this.tenancy.isActiveMemberId(actor.organizationId, responsibleMemberId))
      ) {
        return err(RESPONSIBLE_NOT_MEMBER);
      }
      if (document.bidx && (await this.patients.documentTaken(document.bidx, null)))
        return err(DOCUMENT_TAKEN);
      const capacity = await this.tenancy.ensurePatientCapacity(actor.organizationId, () =>
        this.patients.countActivePatients(),
      );
      if (!capacity.ok) return capacity;
      const organization = await this.tenancy.organization(actor.organizationId);
      const number = await this.patients.nextPatientNumber(actor.organizationId);
      await this.patients.insert({
        id,
        organizationId: actor.organizationId,
        userId: null,
        code: patientCode(number),
        firstName: input.firstName,
        lastName: input.lastName,
        sex: input.sex,
        birthDate: input.birthDate,
        documentType: document.type,
        documentNumberEnc: document.enc,
        documentNumberBidx: document.bidx,
        email: input.email ?? null,
        phoneEnc: input.phone ? this.encryption.encrypt(input.phone, phoneAad(id)) : null,
        timezone: organization?.timezone ?? 'America/Lima',
        population: input.population,
        status: 'ACTIVE',
        responsibleMemberId,
        version: 0,
        createdBy: actor.userId,
      });
      await this.patients.upsertCareTeamMember(
        { id, organizationId: actor.organizationId },
        { memberId: responsibleMemberId, role: 'RESPONSIBLE', access: 'WRITE' },
        actor.userId,
      );
      await this.#emit(context, 'clinical.patient.registered', id, {});
      return ok({ id });
    });
  }

  /** Editar la ficha: el equipo con WRITE; cambiar el responsable, quien gestiona. Bloqueo optimista por version. */
  update(
    context: SecurityContext,
    patientId: string,
    version: number,
    change: PatientUpdate,
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    const document =
      change.document === undefined
        ? undefined
        : this.#document(actor.organizationId, patientId, change.document);
    if (document === 'INVALID') return Promise.resolve(err(INVALID_DOCUMENT));
    return this.#updateChecked(context, patientId, version, change, document);
  }

  /**
   * El documento repetido se consulta en su propia transacción, antes del resto: app.patient_document_taken deja el
   * intento en la auditoría y esa fila no debe perderse si la edición se revierte (RN-B03).
   */
  async #updateChecked(
    context: SecurityContext,
    patientId: string,
    version: number,
    change: PatientUpdate,
    document:
      { type: DocumentType | null; enc: Uint8Array | null; bidx: Uint8Array | null } | undefined,
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    const bidx = document?.bidx;
    if (bidx && (await this.uow.run(context, () => this.patients.documentTaken(bidx, patientId)))) {
      return err(DOCUMENT_TAKEN);
    }
    return atomically(this.uow, context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      const team = await this.patients.careTeam(patientId);
      if (!canWriteClinical(actor, team)) return err(WRITE_ACCESS_REQUIRED);
      const changes: PatientChanges = {
        ...(change.firstName === undefined ? {} : { firstName: change.firstName }),
        ...(change.lastName === undefined ? {} : { lastName: change.lastName }),
        ...(change.sex === undefined ? {} : { sex: change.sex }),
        ...(change.birthDate === undefined ? {} : { birthDate: change.birthDate }),
        ...(change.email === undefined ? {} : { email: change.email }),
        ...(change.phone === undefined
          ? {}
          : {
              phoneEnc: change.phone
                ? this.encryption.encrypt(change.phone, phoneAad(patientId))
                : null,
            }),
      };
      if (change.population !== undefined) {
        const hasHealthData = (await this.consents.active(patientId, 'HEALTH_DATA')) !== null;
        const population = checkPopulation(change.population, hasHealthData);
        if (population) return err(population);
        Object.assign(changes, { population: change.population });
      }
      if (document) {
        Object.assign(changes, {
          documentType: document.type,
          documentNumberEnc: document.enc,
          documentNumberBidx: document.bidx,
        });
      }
      if (
        change.responsibleMemberId !== undefined &&
        change.responsibleMemberId !== patient.responsibleMemberId
      ) {
        const responsible = await this.#changeResponsible(
          context,
          patient,
          change.responsibleMemberId,
        );
        if (responsible) return err(responsible);
        Object.assign(changes, { responsibleMemberId: change.responsibleMemberId });
      }
      if (!(await this.patients.update(patientId, version, changes))) return err(VERSION_CONFLICT);
      await this.#emit(context, 'clinical.patient.updated', patientId, {
        fields: Object.keys(change),
      });
      return ok(undefined);
    });
  }

  /** Archivar libera cupo y cierra las sesiones de la app del paciente (02 §8). */
  archive(context: SecurityContext, patientId: string): Promise<Result<void, DomainError>> {
    return this.#setStatus(context, patientId, 'ARCHIVED');
  }

  /** Reactivar vuelve a pasar por el cupo (RN-A03). */
  reactivate(context: SecurityContext, patientId: string): Promise<Result<void, DomainError>> {
    return this.#setStatus(context, patientId, 'ACTIVE');
  }

  setCareTeamMember(
    context: SecurityContext,
    patientId: string,
    member: {
      memberId: string;
      role: Exclude<CareTeamRole, 'RESPONSIBLE'>;
      access: CareTeamAccess;
    },
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      if (!canManagePatient(actor, patient.responsibleMemberId)) return err(NOT_RESPONSIBLE);
      if (member.memberId === patient.responsibleMemberId) return err(CANNOT_REMOVE_RESPONSIBLE);
      if (!(await this.tenancy.isActiveMemberId(actor.organizationId, member.memberId))) {
        return err(RESPONSIBLE_NOT_MEMBER);
      }
      await this.patients.upsertCareTeamMember(patient, member, actor.userId);
      await this.#emit(context, 'clinical.careteam.changed', patientId, {
        memberId: member.memberId,
      });
      return ok(undefined);
    });
  }

  removeCareTeamMember(
    context: SecurityContext,
    patientId: string,
    memberId: string,
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      if (!canManagePatient(actor, patient.responsibleMemberId)) return err(NOT_RESPONSIBLE);
      if (memberId === patient.responsibleMemberId) return err(CANNOT_REMOVE_RESPONSIBLE);
      if (!(await this.patients.removeCareTeamMember(patientId, memberId)))
        return err(PATIENT_NOT_FOUND);
      await this.#emit(context, 'clinical.careteam.changed', patientId, { memberId });
      return ok(undefined);
    });
  }

  async #changeResponsible(
    context: SecurityContext,
    patient: PatientRecord,
    memberId: string,
  ): Promise<DomainError | null> {
    const actor = actorOf(context);
    if (!canManagePatient(actor, patient.responsibleMemberId)) return NOT_RESPONSIBLE;
    if (!(await this.tenancy.isActiveMemberId(actor.organizationId, memberId)))
      return RESPONSIBLE_NOT_MEMBER;
    // El anterior sigue en el equipo como colaborador con escritura; se le puede quitar después.
    await this.patients.upsertCareTeamMember(
      patient,
      { memberId: patient.responsibleMemberId, role: 'COLLABORATOR', access: 'WRITE' },
      actor.userId,
    );
    await this.patients.upsertCareTeamMember(
      patient,
      { memberId, role: 'RESPONSIBLE', access: 'WRITE' },
      actor.userId,
    );
    return null;
  }

  #setStatus(
    context: SecurityContext,
    patientId: string,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      if (!canManagePatient(actor, patient.responsibleMemberId)) return err(NOT_RESPONSIBLE);
      if (patient.status === status) return err(ALREADY_IN_STATUS);
      if (status === 'ACTIVE') {
        const capacity = await this.tenancy.ensurePatientCapacity(actor.organizationId, () =>
          this.patients.countActivePatients(),
        );
        if (!capacity.ok) return capacity;
      }
      const from = status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
      if (!(await this.patients.setStatus(patientId, status, from, this.clock.now())))
        return err(ALREADY_IN_STATUS);
      await this.#emit(
        context,
        status === 'ARCHIVED' ? 'clinical.patient.archived' : 'clinical.patient.reactivated',
        patientId,
        { userId: patient.userId },
      );
      return ok(undefined);
    });
  }

  /** Documento normalizado, cifrado con datos asociados del paciente e índice ciego por organización (RN-B06). */
  #document(
    organizationId: OrganizationId,
    patientId: string,
    document: { type: DocumentType; number: string } | null | undefined,
  ): { type: DocumentType | null; enc: Uint8Array | null; bidx: Uint8Array | null } | 'INVALID' {
    if (!document) return { type: null, enc: null, bidx: null };
    const normalized = normalizeDocument(document.type, document.number);
    if (!normalized) return 'INVALID';
    return {
      type: document.type,
      enc: this.encryption.encrypt(normalized, documentAad(patientId)),
      bidx: this.encryption.blindIndex(organizationId, document.type, normalized),
    };
  }

  async #emit(
    context: SecurityContext,
    type: ClinicalEventType,
    patientId: string,
    payload: object,
  ): Promise<void> {
    const actor = actorOf(context);
    await this.outbox.append(
      [
        clinicalEvent(
          type,
          actor.organizationId,
          patientId,
          { patientId, ...payload },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: actor.userId, actorRole: context.role },
    );
  }
}
