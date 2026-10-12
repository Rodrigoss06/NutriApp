import { Global, Module } from '@nestjs/common';
import { PATIENT_ENROLLMENT } from '../iam/index.js';
import { ACTIVE_PATIENT_COUNTER } from '../tenancy/index.js';
import { ClinicalApi } from './application/clinical-api.js';
import { ClinicalRecordCommands } from './application/commands/clinical-record.commands.js';
import { ConsentCommands } from './application/commands/consent.commands.js';
import { PatientInvitationCommands } from './application/commands/patient-invitation.commands.js';
import { PatientCommands } from './application/commands/patient.commands.js';
import { PatientEnrollmentService } from './application/patient-enrollment.js';
import {
  CLINICAL_RECORD_STORE,
  CONSENT_STORE,
  PATIENT_STORE,
} from './application/ports/clinical.ports.js';
import { ClinicalRecordQueries } from './application/queries/clinical-record.queries.js';
import { PatientQueries } from './application/queries/patient.queries.js';
import { ClinicalRecordController } from './adapters/in/http/clinical-record.controller.js';
import { PatientController } from './adapters/in/http/patient.controller.js';
import { PrismaClinicalRecordStore } from './adapters/out/persistence/prisma-clinical-records.store.js';
import {
  PrismaConsentStore,
  PrismaPatientStore,
} from './adapters/out/persistence/prisma-clinical.stores.js';

/**
 * clinical (02 §2): pacientes, equipo de atención, consentimiento, historia clínica y notas. Global para entregar a
 * tenancy el conteo real de pacientes activos (ACTIVE_PATIENT_COUNTER, RN-A03) y a iam la inscripción del paciente
 * en la app (PATIENT_ENROLLMENT, RN-A06).
 */
@Global()
@Module({
  controllers: [PatientController, ClinicalRecordController],
  providers: [
    PatientCommands,
    ConsentCommands,
    ClinicalRecordCommands,
    PatientInvitationCommands,
    PatientQueries,
    ClinicalRecordQueries,
    ClinicalApi,
    PatientEnrollmentService,
    { provide: PATIENT_ENROLLMENT, useExisting: PatientEnrollmentService },
    { provide: CLINICAL_RECORD_STORE, useClass: PrismaClinicalRecordStore },
    { provide: PATIENT_STORE, useClass: PrismaPatientStore },
    { provide: CONSENT_STORE, useClass: PrismaConsentStore },
    {
      provide: ACTIVE_PATIENT_COUNTER,
      useFactory: (api: ClinicalApi) => ({ count: () => api.countActivePatients() }),
      inject: [ClinicalApi],
    },
  ],
  exports: [ClinicalApi, ACTIVE_PATIENT_COUNTER, PATIENT_ENROLLMENT],
})
export class ClinicalModule {}
