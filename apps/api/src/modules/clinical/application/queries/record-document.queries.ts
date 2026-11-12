import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type DomainError,
  type Id,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import { PATIENT_NOT_FOUND } from '../../domain/clinical-rules.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientStore,
} from '../ports/clinical.ports.js';
import {
  RECORD_DOCUMENT_STORE,
  type RecordDocumentRecord,
  type RecordDocumentStore,
} from '../ports/record-document.ports.js';

export interface RecordDocumentsView {
  /** Para avisar antes de subir: todo pide HEALTH_DATA; las fotos y los enlaces, también IMAGES. */
  readonly consents: { readonly healthData: boolean; readonly images: boolean };
  readonly documents: readonly RecordDocumentRecord[];
}

export interface RecordDocumentFile {
  readonly content: Buffer;
  readonly mimeType: string;
  readonly title: string;
}

const RESOURCE = 'clinical.record_document';

/**
 * Los documentos del expediente (P14.5, PR 8; RN-G21; ADR-122): para el equipo, con su RLS (RN-A05; fuera de él, como si no
 * existieran); para el alumno, los suyos. Ver la lista y descargar un archivo quedan en la auditoría (RN-B03).
 */
@Injectable()
export class RecordDocumentQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    @Inject(RECORD_DOCUMENT_STORE) private readonly documents: RecordDocumentStore,
  ) {}

  list(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<RecordDocumentsView, DomainError>> {
    return this.uow.query(context, async () => {
      if (context.role === 'PATIENT' && context.patientId !== patientId) {
        return err(PATIENT_NOT_FOUND);
      }
      if (!(await this.patients.find(patientId))) return err(PATIENT_NOT_FOUND);
      const documents = await this.documents.listOfPatient(patientId);
      const healthData = (await this.consents.active(patientId, 'HEALTH_DATA')) !== null;
      const images = (await this.consents.active(patientId, 'IMAGES')) !== null;
      await this.audit.record(context, {
        action: 'READ',
        resourceType: RESOURCE,
        resourceId: patientId as Id<string>,
        patientId: patientId as PatientId,
      });
      return ok({ consents: { healthData, images }, documents });
    });
  }

  /** El archivo de un documento que el contexto ve; sin archivo o fuera de su vista, null. */
  file(context: SecurityContext, documentId: string): Promise<RecordDocumentFile | null> {
    return this.uow.query(context, async () => {
      const document = await this.documents.find(documentId);
      if (
        !document?.fileId ||
        (context.role === 'PATIENT' && document.patientId !== context.patientId)
      ) {
        return null;
      }
      const file = await this.files.read(document.fileId);
      if (!file) return null;
      await this.audit.record(context, {
        action: 'READ',
        resourceType: RESOURCE,
        resourceId: document.id as Id<string>,
        patientId: document.patientId as PatientId,
      });
      return { content: file.content, mimeType: file.mimeType, title: document.title };
    });
  }
}
