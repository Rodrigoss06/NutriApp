import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { SheetBrand, SheetKind, SourceType } from '../../domain/sheet.js';
import type { SheetContent } from '../sheets/sheet-content.js';

/** Lo que identifica un PDF (RN-H02): con estos datos iguales, se reutiliza en vez de generarse otra vez. */
export interface DocumentKey {
  readonly kind: SheetKind;
  readonly sourceType: SourceType;
  readonly sourceId: string;
  /** SHA-256 en hexadecimal del contenido de la ficha. */
  readonly sourceHash: string;
  readonly templateVersion: string;
  /** SHA-256 en hexadecimal de la marca. */
  readonly brandingHash: string;
}

/** documents.generated_document: no se edita; regenerar con otro contenido o marca crea otra fila. */
export interface GeneratedDocumentRecord extends DocumentKey {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly fileId: string;
  /** SHA-256 en hexadecimal de los bytes del PDF. */
  readonly sha256: string;
  readonly generatedBy: UserId;
  readonly generatedAt: Date;
}

/** documents con la transacción de la UnitOfWork; la RLS limita a la organización y al equipo de atención. */
export interface DocumentStore {
  /** La versión activa de la plantilla: la propia de la organización o, si no tiene, la global. */
  activeTemplateVersion(kind: SheetKind): Promise<string | null>;
  findByKey(key: DocumentKey): Promise<GeneratedDocumentRecord | null>;
  find(id: string): Promise<GeneratedDocumentRecord | null>;
  /** INSERT sin pisar: false si otro trabajo guardó antes el mismo PDF (generated_document_reuse). */
  insert(record: GeneratedDocumentRecord): Promise<boolean>;
}

export const DOCUMENT_STORE = Symbol.for('nutricoach.documents.DocumentStore');

export interface SheetLogo {
  readonly content: Uint8Array;
  readonly mimeType: string;
}

/** Lo que dibuja una plantilla. issuedAt es la fecha del origen: va en los metadatos del PDF en vez del reloj. */
export interface SheetRender {
  readonly content: SheetContent;
  readonly brand: SheetBrand;
  readonly logo: SheetLogo | null;
  readonly templateVersion: string;
  readonly issuedAt: Date;
}

/** Dibuja una ficha en PDF. Con la misma entrada devuelve los mismos bytes (RN-H02). */
export interface PdfRenderer {
  render(input: SheetRender): Promise<Uint8Array>;
}

export const PDF_RENDERER = Symbol.for('nutricoach.documents.PdfRenderer');
