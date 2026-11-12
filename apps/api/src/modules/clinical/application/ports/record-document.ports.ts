import type {
  DocumentActor,
  RecordDocumentCategory,
  RecordDocumentStatus,
} from '../../domain/record-document.js';

/** Un documento del expediente vigente (clinical.record_document, sin los borrados), con el tipo y el peso de su archivo. */
export interface RecordDocumentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly category: RecordDocumentCategory;
  readonly title: string;
  readonly status: RecordDocumentStatus;
  readonly linkUrl: string | null;
  readonly fileId: string | null;
  readonly file: { readonly mimeType: string; readonly sizeBytes: number } | null;
  readonly reviewNote: string | null;
  readonly createdBy: string;
  readonly createdByRole: DocumentActor;
  readonly createdAt: Date;
  readonly contentByRole: DocumentActor | null;
  readonly contentAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly version: number;
}

export interface NewRecordDocument {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly category: RecordDocumentCategory;
  readonly title: string;
  readonly status: RecordDocumentStatus;
  readonly linkUrl: string | null;
  readonly fileId: string | null;
  readonly createdBy: string;
  readonly createdByRole: DocumentActor;
  readonly createdAt: Date;
  /** Quién puso el contenido: el mismo que lo crea, si trae uno. */
  readonly content: { readonly by: string; readonly role: DocumentActor } | null;
}

/** Lo que cambia un caso de uso; la versión sube sola. */
export interface RecordDocumentChanges {
  readonly status?: RecordDocumentStatus;
  readonly content?: {
    readonly linkUrl: string | null;
    readonly fileId: string | null;
    readonly by: string;
    readonly role: DocumentActor;
    readonly at: Date;
  };
  /** La nota del coach al devolverlo; null la borra. */
  readonly reviewNote?: string | null;
  readonly reviewed?: { readonly by: string; readonly at: Date };
  readonly deleted?: { readonly by: string; readonly at: Date };
}

/** clinical.record_document, en la transacción de quien llama y con su RLS (RN-A05; el alumno, solo lo suyo). */
export interface RecordDocumentStore {
  insert(document: NewRecordDocument): Promise<void>;
  /** Un documento vigente que el contexto ve; borrado o fuera de su vista, null. */
  find(id: string): Promise<RecordDocumentRecord | null>;
  /** Los vigentes del paciente, del más nuevo al más antiguo. */
  listOfPatient(patientId: string): Promise<readonly RecordDocumentRecord[]>;
  /** Bloqueo optimista: false si la versión no coincide o ya está borrado. */
  update(id: string, expectedVersion: number, changes: RecordDocumentChanges): Promise<boolean>;
}

export const RECORD_DOCUMENT_STORE = Symbol.for('nutricoach.clinical.RecordDocumentStore');
