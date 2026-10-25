import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  OUTBOX,
  type Clock,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type UserId,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../platform/index.js';
import { documentsEvent } from './documents-events.js';
import {
  DOCUMENT_STORE,
  PDF_RENDERER,
  type DocumentStore,
  type GeneratedDocumentRecord,
  type PdfRenderer,
} from './ports/documents.ports.js';
import { documentKey, SheetSources, type SheetSource } from './sheet-sources.js';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/**
 * Genera una ficha en el worker (RF-24, RN-H02): la arma desde su origen, la reutiliza si ya existe con el mismo
 * contenido, plantilla y marca, y si no la dibuja, guarda el PDF con FileRegistry y su fila en generated_document. Corre
 * en la transacción del consumidor, con el contexto SYSTEM de la organización.
 */
@Injectable()
export class DocumentGeneration {
  constructor(
    @Inject(SheetSources) private readonly sources: SheetSources,
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /**
   * La ficha de un origen; null si no tiene (un borrador, un origen que ya no existe o una ficha que aún no se dibuja).
   * generatedBy es quien la pidió; sin pedido, quien firma el origen.
   */
  async generate(
    organizationId: OrganizationId,
    source: SheetSource,
    generatedBy: UserId | null,
  ): Promise<GeneratedDocumentRecord | null> {
    const prepared = await this.sources.prepare(organizationId, source);
    if (!prepared.ok) return null;
    const { sheet } = prepared;
    const templateVersion = await this.store.activeTemplateVersion(sheet.kind);
    if (!templateVersion) throw new Error(`No hay una plantilla activa de ${sheet.kind}.`);
    const key = documentKey(sheet, templateVersion);
    const existing = await this.store.findByKey(key);
    if (existing) return existing;

    const logo = sheet.brand.logoFileId ? await this.files.read(sheet.brand.logoFileId) : null;
    const pdf = await this.renderer.render({
      content: sheet.content,
      brand: sheet.brand,
      logo,
      templateVersion,
      issuedAt: sheet.issuedAt,
    });
    const written = await this.files.write(organizationId, pdf);
    if (written?.mimeType !== 'application/pdf') {
      if (written) await this.files.discard(written.key);
      throw new Error('La plantilla no devolvió un PDF.');
    }
    const record: GeneratedDocumentRecord = {
      id: this.ids.newId<'DocumentId'>(),
      organizationId,
      patientId: sheet.patientId,
      ...key,
      fileId: written.id,
      sha256: hex(written.sha256),
      generatedBy: generatedBy ?? sheet.authorUserId,
      generatedAt: this.clock.now(),
    };
    try {
      if (!(await this.store.insert(record))) {
        // Otro trabajo guardó el mismo PDF primero: se usa el suyo.
        await this.files.discard(written.key);
        return await this.store.findByKey(key);
      }
      await this.files.register({
        id: written.id,
        key: written.key,
        mimeType: written.mimeType,
        sha256: written.sha256,
        sizeBytes: pdf.byteLength,
        organizationId,
        purpose: 'GENERATED_DOCUMENT',
        uploadedBy: null,
      });
      await this.outbox.append(
        [
          documentsEvent(
            'documents.document.generated',
            organizationId,
            record.id,
            {
              patientId: record.patientId,
              kind: record.kind,
              sourceType: record.sourceType,
              sourceId: record.sourceId,
            },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: record.generatedBy, actorRole: 'SYSTEM' },
      );
    } catch (error) {
      await this.files.discard(written.key);
      throw error;
    }
    return record;
  }
}
