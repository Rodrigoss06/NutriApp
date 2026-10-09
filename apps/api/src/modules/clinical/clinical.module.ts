import { Global, Module } from '@nestjs/common';
import { ACTIVE_PATIENT_COUNTER } from '../tenancy/index.js';
import { ClinicalApi } from './application/clinical-api.js';
import { ConsentCommands } from './application/commands/consent.commands.js';
import { PatientCommands } from './application/commands/patient.commands.js';
import { CONSENT_STORE, PATIENT_STORE } from './application/ports/clinical.ports.js';
import { PatientQueries } from './application/queries/patient.queries.js';
import { PatientController } from './adapters/in/http/patient.controller.js';
import {
  PrismaConsentStore,
  PrismaPatientStore,
} from './adapters/out/persistence/prisma-clinical.stores.js';

/**
 * clinical (02 §2): pacientes, equipo de atención, consentimiento, historia clínica y notas. Global para entregar a
 * tenancy el conteo real de pacientes activos (ACTIVE_PATIENT_COUNTER, RN-A03).
 */
@Global()
@Module({
  controllers: [PatientController],
  providers: [
    PatientCommands,
    ConsentCommands,
    PatientQueries,
    ClinicalApi,
    { provide: PATIENT_STORE, useClass: PrismaPatientStore },
    { provide: CONSENT_STORE, useClass: PrismaConsentStore },
    {
      provide: ACTIVE_PATIENT_COUNTER,
      useFactory: (api: ClinicalApi) => ({ count: () => api.countActivePatients() }),
      inject: [ClinicalApi],
    },
  ],
  exports: [ClinicalApi, ACTIVE_PATIENT_COUNTER],
})
export class ClinicalModule {}
