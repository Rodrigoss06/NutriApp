import { Module, type OnModuleInit } from '@nestjs/common';
import { AssessmentModule } from '../assessment/index.js';
import { ClinicalApi } from '../clinical/index.js';
import { ExerciseModule } from '../exercise/index.js';
import { EnergyPrescriptionCommands } from './application/commands/energy-prescription.commands.js';
import { NutritionTimelineSource } from './application/nutrition-timeline.js';
import { ENERGY_PRESCRIPTION_STORE } from './application/ports/nutrition.ports.js';
import { EnergyPrescriptionQueries } from './application/queries/energy-prescription.queries.js';
import {
  EnergyPrescriptionController,
  PatientEnergyController,
} from './adapters/in/http/energy-prescription.controller.js';
import { PrismaEnergyPrescriptionStore } from './adapters/out/persistence/prisma-energy-prescription.store.js';

/**
 * nutrition (02 §2, núcleo): por ahora la prescripción energética (RF-17, RF-18 adelantado); los planes llegan en P9.
 * Pide la composición a assessment y las actividades a exercise por sus API públicas.
 */
@Module({
  imports: [AssessmentModule, ExerciseModule],
  controllers: [PatientEnergyController, EnergyPrescriptionController],
  providers: [
    EnergyPrescriptionCommands,
    EnergyPrescriptionQueries,
    NutritionTimelineSource,
    { provide: ENERGY_PRESCRIPTION_STORE, useClass: PrismaEnergyPrescriptionStore },
  ],
})
export class NutritionModule implements OnModuleInit {
  constructor(
    private readonly clinical: ClinicalApi,
    private readonly timeline: NutritionTimelineSource,
  ) {}

  onModuleInit(): void {
    this.clinical.registerTimelineSource(this.timeline);
  }
}
