import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/index.js';
import { NutritionModule } from '../nutrition/index.js';
import { TrainingModule } from '../training/index.js';
import { SheetsConsumer } from './adapters/in/events/sheets.consumer.js';
import {
  DocumentsController,
  PatientDocumentsController,
} from './adapters/in/http/documents.controller.js';
import { PrismaDocumentStore } from './adapters/out/persistence/prisma-document.store.js';
import { ReactPdfRenderer } from './adapters/out/pdf/react-pdf.renderer.js';
import { DocumentGeneration } from './application/document-generation.js';
import { DocumentRequests } from './application/document-requests.js';
import { DOCUMENT_STORE, PDF_RENDERER } from './application/ports/documents.ports.js';
import { SheetSources } from './application/sheet-sources.js';

/**
 * documents (02 §2): las fichas PDF con la marca del profesional (RF-24), generadas en el worker desde el snapshot de un
 * plan o un programa publicado o desde una evaluación cerrada, y reutilizadas mientras nada cambie (RN-H02).
 */
@Module({
  imports: [AssessmentModule, NutritionModule, TrainingModule],
  controllers: [PatientDocumentsController, DocumentsController],
  providers: [
    SheetSources,
    DocumentRequests,
    DocumentGeneration,
    SheetsConsumer,
    { provide: DOCUMENT_STORE, useClass: PrismaDocumentStore },
    { provide: PDF_RENDERER, useClass: ReactPdfRenderer },
  ],
})
export class DocumentsModule {}
