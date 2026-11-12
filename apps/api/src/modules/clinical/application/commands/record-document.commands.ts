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
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically, FileRegistry } from '../../../../platform/index.js';
import {
  canWriteRecord,
  HEALTH_DATA_REQUIRED,
  IMAGES_CONSENT_REQUIRED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../domain/clinical-rules.js';
import {
  canDeleteDocument,
  needsImagesConsent,
  RECORD_DOCUMENT_CONTENT_CONFLICT,
  RECORD_DOCUMENT_CONTENT_REQUIRED,
  RECORD_DOCUMENT_FILE_UNSUPPORTED,
  RECORD_DOCUMENT_LOCKED,
  RECORD_DOCUMENT_NOT_FOUND,
  RECORD_DOCUMENT_VERSION_CONFLICT,
  statusOnAdd,
  statusOnContent,
  statusOnReview,
  type DocumentActor,
  type DocumentContentKind,
  type RecordDocumentCategory,
  type RecordDocumentStatus,
  type ReviewDecision,
} from '../../domain/record-document.js';
import { clinicalEvent, type ClinicalEventType } from '../clinical-events.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientRecord,
  type PatientStore,
} from '../ports/clinical.ports.js';
import {
  RECORD_DOCUMENT_STORE,
  type RecordDocumentRecord,
  type RecordDocumentStore,
} from '../ports/record-document.ports.js';
import { actorOf } from './patient.commands.js';

export interface RecordDocumentInput {
  readonly title: string;
  readonly category: RecordDocumentCategory;
  readonly linkUrl?: string | null | undefined;
}

/** El contenido nuevo: un enlace o los bytes de un archivo, nunca los dos. */
export interface DocumentContentInput {
  readonly linkUrl?: string | null | undefined;
  readonly file?: Uint8Array | null | undefined;
}

export type DocumentReview =
  | { readonly decision: Extract<ReviewDecision, 'VALIDATE'> }
  | { readonly decision: Extract<ReviewDecision, 'RETURN'>; readonly note: string };

export interface DocumentChanged {
  readonly id: string;
  readonly status: RecordDocumentStatus;
  readonly version: number;
}

/** Un archivo ya escrito en el almacenamiento, antes de registrarlo en la transacción (ADR-038). */
type WrittenFile = NonNullable<Awaited<ReturnType<FileRegistry['write']>>> & {
  readonly sizeBytes: number;
};

const FILE_PURPOSE = 'RECORD_DOCUMENT';

/**
 * El expediente de documentos (P14.5, PR 8; P-31; RN-G21; ADR-122). El coach pide un documento sin contenido o agrega uno con su
 * archivo o enlace, ya validado; el alumno completa un pedido o sube uno nuevo, para revisar; el coach lo valida o lo devuelve con
 * una nota. Agregar y reemplazar exigen HEALTH_DATA (RN-B01) y, las fotos y los enlaces, también IMAGES (07, «Privacidad»). Borrar
 * es lógico: el archivo se marca borrado y sus bytes se descartan al confirmar, como los reemplazados. El coach necesita escribir
 * en el expediente (RN-A05); el alumno solo toca lo suyo, desde su sesión.
 */
@Injectable()
export class RecordDocumentCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    @Inject(RECORD_DOCUMENT_STORE) private readonly documents: RecordDocumentStore,
  ) {}

  /** El coach: sin contenido, un pedido («Pendiente»); con un enlace o un archivo, «Validado». */
  addAsStaff(
    context: SecurityContext,
    patientId: string,
    input: RecordDocumentInput,
    file: Uint8Array | null,
  ): Promise<Result<DocumentChanged, DomainError>> {
    return this.#add(context, patientId, 'STAFF', input, file);
  }

  /** El alumno, desde su app: siempre con un enlace o un archivo, «Por revisar». */
  addAsPatient(
    context: SecurityContext,
    input: RecordDocumentInput,
    file: Uint8Array | null,
  ): Promise<Result<DocumentChanged, DomainError>> {
    if (!context.patientId) return Promise.resolve(err(PATIENT_NOT_FOUND));
    return this.#add(context, context.patientId, 'PATIENT', input, file);
  }

  replaceAsStaff(
    context: SecurityContext,
    documentId: string,
    expectedVersion: number,
    content: DocumentContentInput,
  ): Promise<Result<DocumentChanged, DomainError>> {
    return this.#replace(context, 'STAFF', documentId, expectedVersion, content);
  }

  replaceAsPatient(
    context: SecurityContext,
    documentId: string,
    expectedVersion: number,
    content: DocumentContentInput,
  ): Promise<Result<DocumentChanged, DomainError>> {
    return this.#replace(context, 'PATIENT', documentId, expectedVersion, content);
  }

  /** El coach valida lo que está por revisar o lo devuelve a «Pendiente» con una nota para el alumno. */
  review(
    context: SecurityContext,
    documentId: string,
    expectedVersion: number,
    review: DocumentReview,
  ): Promise<Result<DocumentChanged, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const found = await this.#current(context, 'STAFF', documentId, expectedVersion);
      if (!found.ok) return found;
      const document = found.value;
      const access = await this.#access(context, document.patientId, 'STAFF', true);
      if (!access.ok) return access;
      const status = statusOnReview(document, review.decision);
      if (!status.ok) return status;
      const now = this.clock.now();
      const updated = await this.documents.update(document.id, expectedVersion, {
        status: status.value,
        reviewNote: review.decision === 'RETURN' ? review.note : null,
        reviewed: { by: actor.userId, at: now },
      });
      if (!updated) return err(RECORD_DOCUMENT_VERSION_CONFLICT);
      await this.#emit(context, 'clinical.document.reviewed', document.patientId, document.id, {
        decision: review.decision,
        status: status.value,
      });
      return ok({ id: document.id, status: status.value, version: expectedVersion + 1 });
    });
  }

  deleteAsStaff(
    context: SecurityContext,
    documentId: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    return this.#delete(context, 'STAFF', documentId, expectedVersion);
  }

  deleteAsPatient(
    context: SecurityContext,
    documentId: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    return this.#delete(context, 'PATIENT', documentId, expectedVersion);
  }

  async #add(
    context: SecurityContext,
    patientId: string,
    role: DocumentActor,
    input: RecordDocumentInput,
    file: Uint8Array | null,
  ): Promise<Result<DocumentChanged, DomainError>> {
    const actor = actorOf(context);
    const link = input.linkUrl ?? null;
    if (link !== null && file !== null) return err(RECORD_DOCUMENT_CONTENT_CONFLICT);
    const status = statusOnAdd(role, link !== null || file !== null);
    if (!status.ok) return status;
    const written = file === null ? null : await this.#write(actor.organizationId, file);
    if (written && !written.ok) return written;
    const stored = written?.value ?? null;
    return this.#withFile(stored, () =>
      atomically<{ changed: DocumentChanged; retiredKey: null }>(this.uow, context, async () => {
        const access = await this.#access(context, patientId, role, true);
        if (!access.ok) return access;
        const images = await this.#imagesConsent(patientId, link, stored);
        if (!images.ok) return images;
        if (stored) await this.#register(stored, context);
        const now = this.clock.now();
        const id = this.ids.newId<'RecordDocumentId'>();
        const hasContent = link !== null || stored !== null;
        await this.documents.insert({
          id,
          organizationId: actor.organizationId,
          patientId,
          category: input.category,
          title: input.title,
          status: status.value,
          linkUrl: link,
          fileId: stored?.id ?? null,
          createdBy: actor.userId,
          createdByRole: role,
          createdAt: now,
          content: hasContent ? { by: actor.userId, role } : null,
        });
        await this.#emit(context, 'clinical.document.added', patientId, id, {
          category: input.category,
          status: status.value,
          content: link !== null ? 'LINK' : stored ? 'FILE' : null,
          byRole: role,
        });
        return ok({ changed: { id, status: status.value, version: 1 }, retiredKey: null });
      }),
    );
  }

  async #replace(
    context: SecurityContext,
    role: DocumentActor,
    documentId: string,
    expectedVersion: number,
    content: DocumentContentInput,
  ): Promise<Result<DocumentChanged, DomainError>> {
    const actor = actorOf(context);
    const link = content.linkUrl ?? null;
    const file = content.file ?? null;
    if (link !== null && file !== null) return err(RECORD_DOCUMENT_CONTENT_CONFLICT);
    if (link === null && file === null) return err(RECORD_DOCUMENT_CONTENT_REQUIRED);
    const written = file === null ? null : await this.#write(actor.organizationId, file);
    if (written && !written.ok) return written;
    const stored = written?.value ?? null;
    return this.#withFile(stored, () =>
      atomically<{ changed: DocumentChanged; retiredKey: string | null }>(
        this.uow,
        context,
        async () => {
          const found = await this.#current(context, role, documentId, expectedVersion);
          if (!found.ok) return found;
          const document = found.value;
          const access = await this.#access(context, document.patientId, role, true);
          if (!access.ok) return access;
          const status = statusOnContent(role, document);
          if (!status.ok) return status;
          const images = await this.#imagesConsent(document.patientId, link, stored);
          if (!images.ok) return images;
          if (stored) await this.#register(stored, context);
          const now = this.clock.now();
          // El anterior se marca borrado mientras el documento todavía lo nombra: así la RLS del alumno lo deja.
          const retiredKey = document.fileId ? await this.files.retire(document.fileId, now) : null;
          const updated = await this.documents.update(document.id, expectedVersion, {
            status: status.value,
            content: { linkUrl: link, fileId: stored?.id ?? null, by: actor.userId, role, at: now },
            reviewNote: null,
          });
          if (!updated) return err(RECORD_DOCUMENT_VERSION_CONFLICT);
          await this.#emit(context, 'clinical.document.replaced', document.patientId, document.id, {
            status: status.value,
            content: link !== null ? 'LINK' : 'FILE',
            byRole: role,
          });
          return ok({
            changed: { id: document.id, status: status.value, version: expectedVersion + 1 },
            retiredKey,
          });
        },
      ),
    );
  }

  async #delete(
    context: SecurityContext,
    role: DocumentActor,
    documentId: string,
    expectedVersion: number,
  ): Promise<Result<void, DomainError>> {
    const actor = actorOf(context);
    const result = await atomically<{ retiredKey: string | null }>(this.uow, context, async () => {
      const found = await this.#current(context, role, documentId, expectedVersion);
      if (!found.ok) return found;
      const document = found.value;
      // Borrar no guarda datos de salud: no pide HEALTH_DATA, pero sí escribir en el expediente.
      const access = await this.#access(context, document.patientId, role, false);
      if (!access.ok) return access;
      if (!canDeleteDocument(role, document)) return err(RECORD_DOCUMENT_LOCKED);
      const now = this.clock.now();
      const retiredKey = document.fileId ? await this.files.retire(document.fileId, now) : null;
      const updated = await this.documents.update(document.id, expectedVersion, {
        deleted: { by: actor.userId, at: now },
      });
      if (!updated) return err(RECORD_DOCUMENT_VERSION_CONFLICT);
      await this.#emit(context, 'clinical.document.deleted', document.patientId, document.id, {
        category: document.category,
        byRole: role,
      });
      return ok({ retiredKey });
    });
    if (!result.ok) return result;
    if (result.value.retiredKey) await this.files.discard(result.value.retiredKey);
    return ok(undefined);
  }

  /** Escribe los bytes antes de la transacción; un tipo que no es PDF, JPEG ni PNG no se guarda. */
  async #write(
    organizationId: OrganizationId,
    content: Uint8Array,
  ): Promise<Result<WrittenFile, DomainError>> {
    const file = await this.files.write(organizationId, content);
    return file
      ? ok({ ...file, sizeBytes: content.byteLength })
      : err(RECORD_DOCUMENT_FILE_UNSUPPORTED);
  }

  async #register(file: WrittenFile, context: SecurityContext): Promise<void> {
    const actor = actorOf(context);
    await this.files.register({
      ...file,
      organizationId: actor.organizationId,
      purpose: FILE_PURPOSE,
      uploadedBy: actor.userId,
    });
  }

  /**
   * Corre la transacción con el archivo nuevo ya escrito: si falla, sus bytes se descartan; si confirma, se descartan los del
   * archivo que reemplazó (ADR-038).
   */
  async #withFile(
    stored: WrittenFile | null,
    work: () => Promise<
      Result<{ changed: DocumentChanged; retiredKey: string | null }, DomainError>
    >,
  ): Promise<Result<DocumentChanged, DomainError>> {
    try {
      const result = await work();
      if (!result.ok) {
        if (stored) await this.files.discard(stored.key);
        return result;
      }
      if (result.value.retiredKey) await this.files.discard(result.value.retiredKey);
      return ok(result.value.changed);
    } catch (error) {
      if (stored) await this.files.discard(stored.key);
      throw error;
    }
  }

  /** El documento vigente con la versión esperada; el alumno solo ve los suyos (y la RLS lo asegura). */
  async #current(
    context: SecurityContext,
    role: DocumentActor,
    documentId: string,
    expectedVersion: number,
  ): Promise<Result<RecordDocumentRecord, DomainError>> {
    const document = await this.documents.find(documentId);
    if (!document || (role === 'PATIENT' && document.patientId !== context.patientId)) {
      return err(RECORD_DOCUMENT_NOT_FOUND);
    }
    if (document.version !== expectedVersion) return err(RECORD_DOCUMENT_VERSION_CONFLICT);
    return ok(document);
  }

  /** Activo y, el coach, con escritura en el equipo (RN-A05); para guardar contenido, HEALTH_DATA vigente (RN-B01). */
  async #access(
    context: SecurityContext,
    patientId: string,
    role: DocumentActor,
    storesHealthData: boolean,
  ): Promise<Result<PatientRecord, DomainError>> {
    const patient = await this.patients.find(patientId);
    if (!patient) return err(PATIENT_NOT_FOUND);
    if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
    if (
      role === 'STAFF' &&
      !canWriteRecord(actorOf(context), await this.patients.careTeam(patientId))
    ) {
      return err(WRITE_ACCESS_REQUIRED);
    }
    if (storesHealthData && !(await this.consents.active(patientId, 'HEALTH_DATA'))) {
      return err(HEALTH_DATA_REQUIRED);
    }
    return ok(patient);
  }

  /** Las fotos y los enlaces piden además IMAGES (07, «Privacidad»); un PDF o un pedido sin contenido, no. */
  async #imagesConsent(
    patientId: string,
    link: string | null,
    stored: WrittenFile | null,
  ): Promise<Result<void, DomainError>> {
    const kind: DocumentContentKind | null =
      link !== null
        ? { kind: 'LINK' }
        : stored
          ? { kind: 'FILE', mimeType: stored.mimeType }
          : null;
    if (!kind || !needsImagesConsent(kind)) return ok(undefined);
    return (await this.consents.active(patientId, 'IMAGES'))
      ? ok(undefined)
      : err(IMAGES_CONSENT_REQUIRED);
  }

  async #emit(
    context: SecurityContext,
    type: ClinicalEventType,
    patientId: string,
    documentId: string,
    payload: object,
  ): Promise<void> {
    const actor = actorOf(context);
    await this.outbox.append(
      [
        clinicalEvent(
          type,
          actor.organizationId,
          documentId,
          { patientId, ...payload },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: actor.userId, actorRole: context.role },
    );
  }
}
