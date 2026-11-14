import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { PatientExportConsumer } from './adapters/in/events/patient-export.consumer.js';
import { MeClinicalController } from './adapters/in/http/me-clinical.controller.js';
import {
  MeExportsController,
  PatientExportsController,
} from './adapters/in/http/patient-export.controller.js';
import { PatientExportJob } from './adapters/in/jobs/patient-export.job.js';
import { FflateArchiveWriter } from './adapters/out/archive/fflate-archive.writer.js';
import { PrismaPatientExportStore } from './adapters/out/persistence/prisma-patient-export.store.js';
import { ClinicalExportSource } from './application/clinical-export-source.js';
import { PatientExportCommands } from './application/commands/patient-export.commands.js';
import { PatientExportBuilder } from './application/patient-export-builder.js';
import { PatientExportSources } from './application/patient-export-sources.js';
import { ARCHIVE_WRITER, PATIENT_EXPORT_STORE } from './application/ports/patient-export.ports.js';
import { PatientExportQueries } from './application/queries/patient-export.queries.js';
import {
  MeRecordDocumentsController,
  PatientRecordDocumentsController,
  RecordDocumentController,
} from './adapters/in/http/record-document.controller.js';
import { PatientSelfService } from './application/patient-self-service.js';
import { PATIENT_ENROLLMENT } from '../iam/index.js';
import { ACTIVE_PATIENT_COUNTER } from '../tenancy/index.js';
import { ClinicalApi } from './application/clinical-api.js';
import { ClinicalRecordCommands } from './application/commands/clinical-record.commands.js';
import { ConsentCommands } from './application/commands/consent.commands.js';
import { PatientInvitationCommands } from './application/commands/patient-invitation.commands.js';
import { PatientCommands } from './application/commands/patient.commands.js';
import { RecordDocumentCommands } from './application/commands/record-document.commands.js';
import { PatientEnrollmentService } from './application/patient-enrollment.js';
import {
  CLINICAL_RECORD_STORE,
  CONSENT_STORE,
  PATIENT_STORE,
} from './application/ports/clinical.ports.js';
import { RECORD_DOCUMENT_STORE } from './application/ports/record-document.ports.js';
import { ClinicalRecordQueries } from './application/queries/clinical-record.queries.js';
import { PatientQueries } from './application/queries/patient.queries.js';
import { RecordDocumentQueries } from './application/queries/record-document.queries.js';
import { TimelineSources } from './application/timeline-sources.js';
import { ClinicalRecordController } from './adapters/in/http/clinical-record.controller.js';
import { PatientController } from './adapters/in/http/patient.controller.js';
import { PrismaClinicalRecordStore } from './adapters/out/persistence/prisma-clinical-records.store.js';
import {
  PrismaConsentStore,
  PrismaPatientStore,
} from './adapters/out/persistence/prisma-clinical.stores.js';
import { PrismaRecordDocumentStore } from './adapters/out/persistence/prisma-record-document.store.js';

/**
 * clinical (02 §2): pacientes, equipo de atención, consentimiento, historia clínica, notas, el expediente de documentos
 * (ADR-122) y la exportación del paciente (ADR-131). Global para entregar a
 * tenancy el conteo real de pacientes activos (ACTIVE_PATIENT_COUNTER, RN-A03) y a iam la inscripción del paciente
 * en la app (PATIENT_ENROLLMENT, RN-A06).
 */
@Global()
@Module({
  controllers: [
    PatientController,
    ClinicalRecordController,
    MeClinicalController,
    PatientRecordDocumentsController,
    RecordDocumentController,
    MeRecordDocumentsController,
    PatientExportsController,
    MeExportsController,
  ],
  providers: [
    PatientCommands,
    ConsentCommands,
    ClinicalRecordCommands,
    PatientInvitationCommands,
    RecordDocumentCommands,
    PatientQueries,
    ClinicalRecordQueries,
    RecordDocumentQueries,
    ClinicalApi,
    PatientSelfService,
    TimelineSources,
    PatientExportSources,
    ClinicalExportSource,
    PatientExportCommands,
    PatientExportQueries,
    PatientExportBuilder,
    PatientExportConsumer,
    PatientExportJob,
    PatientEnrollmentService,
    { provide: PATIENT_ENROLLMENT, useExisting: PatientEnrollmentService },
    { provide: CLINICAL_RECORD_STORE, useClass: PrismaClinicalRecordStore },
    { provide: PATIENT_STORE, useClass: PrismaPatientStore },
    { provide: CONSENT_STORE, useClass: PrismaConsentStore },
    { provide: RECORD_DOCUMENT_STORE, useClass: PrismaRecordDocumentStore },
    { provide: PATIENT_EXPORT_STORE, useClass: PrismaPatientExportStore },
    { provide: ARCHIVE_WRITER, useClass: FflateArchiveWriter },
    {
      provide: ACTIVE_PATIENT_COUNTER,
      useFactory: (api: ClinicalApi) => ({ count: () => api.countActivePatients() }),
      inject: [ClinicalApi],
    },
  ],
  exports: [ClinicalApi, ACTIVE_PATIENT_COUNTER, PATIENT_ENROLLMENT],
})
export class ClinicalModule implements OnModuleInit {
  constructor(
    private readonly exportSources: PatientExportSources,
    private readonly clinicalExport: ClinicalExportSource,
  ) {}

  /** Lo de clinical va primero en la exportación del paciente (RN-B04, ADR-131). */
  onModuleInit(): void {
    this.exportSources.register(this.clinicalExport);
  }
}
