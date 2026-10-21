import { Global, Module } from '@nestjs/common';
import { ExerciseModule } from '../modules/exercise/index.js';
import { FoodModule } from '../modules/food/index.js';
import { IamModule, PATIENT_ENROLLMENT, type PatientEnrollment } from '../modules/iam/index.js';
import {
  ACTIVE_PATIENT_COUNTER,
  TenancyModule,
  type ActivePatientCounter,
} from '../modules/tenancy/index.js';
import { PlatformModule } from '../platform/index.js';

/** Un puerto que la CLI no usa: si alguien lo llama, falla con un mensaje claro en vez de hacer algo a medias. */
const unavailable = (port: string) => () =>
  Promise.reject(new Error(`${port} no está disponible en la CLI.`));

const noPatientEnrollment: PatientEnrollment = {
  preview: unavailable('PATIENT_ENROLLMENT'),
  consentTexts: unavailable('PATIENT_ENROLLMENT'),
  enroll: unavailable('PATIENT_ENROLLMENT'),
  patientOfAccount: unavailable('PATIENT_ENROLLMENT'),
};
const noActivePatientCounter: ActivePatientCounter = {
  count: unavailable('ACTIVE_PATIENT_COUNTER'),
};

/**
 * Los puertos que en la API implementa clinical, explícitos y sin uso en la CLI: la CLI no carga clinical y los
 * puertos siguen siendo obligatorios (ADR-021, ADR-040).
 */
@Global()
@Module({
  providers: [
    { provide: PATIENT_ENROLLMENT, useValue: noPatientEnrollment },
    { provide: ACTIVE_PATIENT_COUNTER, useValue: noActivePatientCounter },
  ],
  exports: [PATIENT_ENROLLMENT, ACTIVE_PATIENT_COUNTER],
})
class CliPortsModule {}

/**
 * Raíz de la CLI: plataforma, tenancy e iam para create-platform-admin, y food y exercise para cargar sus catálogos.
 * Sin HTTP ni clinical.
 */
@Module({
  imports: [PlatformModule, TenancyModule, IamModule, CliPortsModule, FoodModule, ExerciseModule],
})
export class CliModule {}
