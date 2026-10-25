import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type DomainError,
  type Id,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../platform/index.js';
import { DOCUMENT_NOT_FOUND, SOURCE_NOT_PUBLISHED } from '../domain/document-errors.js';
import { sheetFileName } from '../domain/sheet.js';
import { documentsEvent } from './documents-events.js';
import {
  DOCUMENT_STORE,
  type DocumentStore,
  type GeneratedDocumentRecord,
} from './ports/documents.ports.js';
import { documentKey, SheetSources, type SheetSource } from './sheet-sources.js';

/** La ficha de un origen: lista para descargar, o en la cola del worker. */
export type DocumentStatus =
  | { readonly status: 'READY'; readonly document: GeneratedDocumentRecord }
  | { readonly status: 'PENDING' };

/**
 * Las fichas desde el panel (RF-24): pedir la de un plan o una evaluación, ver si ya está y descargarla. La genera el
 * worker; aquí solo se arma su contenido para saber si ya existe un PDF igual (RN-H02).
 */
@Injectable()
export class DocumentRequests {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(SheetSources) private readonly sources: SheetSources,
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** La ficha si ya existe; si no, la pide al worker. Vale en solo lectura: exportar no es editar (RN-A02). */
  request(
    context: SecurityContext,
    patientId: string,
    source: SheetSource,
  ): Promise<Result<DocumentStatus, DomainError>> {
    return this.uow.run(context, async () => {
      const current = await this.#current(context, patientId, source);
      if (!current.ok || current.value.status === 'READY') return current;
      await this.outbox.append(
        [
          documentsEvent(
            'documents.document.requested',
            this.#organization(context),
            source.id,
            { patientId, sourceType: source.type, sourceId: source.id },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: context.userId, actorRole: context.role },
      );
      return current;
    });
  }

  /** Si la ficha ya está, sin pedirla: para esperar la que se pidió. */
  status(
    context: SecurityContext,
    patientId: string,
    source: SheetSource,
  ): Promise<Result<DocumentStatus, DomainError>> {
    return this.uow.query(context, () => this.#current(context, patientId, source));
  }

  /** El PDF como adjunto, con la visibilidad del paciente (RN-A05) y auditado como exportación (RN-B03). */
  async file(
    context: SecurityContext,
    documentId: string,
  ): Promise<{ content: Buffer; fileName: string } | null> {
    const found = await this.uow.query(context, async () => {
      const document = await this.store.find(documentId);
      const file = document ? await this.files.read(document.fileId) : null;
      return document && file ? { document, file } : null;
    });
    if (!found) return null;
    await this.audit.record(context, {
      action: 'EXPORT',
      resourceType: 'documents.generated_document',
      resourceId: found.document.id as Id<string>,
      patientId: found.document.patientId as PatientId,
    });
    return { content: found.file.content, fileName: sheetFileName(found.document.kind) };
  }

  async #current(
    context: SecurityContext,
    patientId: string,
    source: SheetSource,
  ): Promise<Result<DocumentStatus, DomainError>> {
    const prepared = await this.sources.prepare(this.#organization(context), source);
    if (!prepared.ok) {
      return err(prepared.reason === 'NOT_PUBLISHED' ? SOURCE_NOT_PUBLISHED : DOCUMENT_NOT_FOUND);
    }
    if (prepared.sheet.patientId !== patientId) return err(DOCUMENT_NOT_FOUND);
    const templateVersion = await this.store.activeTemplateVersion(prepared.sheet.kind);
    if (!templateVersion) throw new Error(`No hay una plantilla activa de ${prepared.sheet.kind}.`);
    const document = await this.store.findByKey(documentKey(prepared.sheet, templateVersion));
    return ok(document ? { status: 'READY', document } : { status: 'PENDING' });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId) throw new Error('Una ficha necesita la organización activa.');
    return context.organizationId;
  }
}
