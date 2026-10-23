import { Module, type OnModuleInit } from '@nestjs/common';
import { AssessmentModule } from '../assessment/index.js';
import { ClinicalApi } from '../clinical/index.js';
import { ExerciseModule } from '../exercise/index.js';
import { FoodModule } from '../food/index.js';
import { EnergyPrescriptionCommands } from './application/commands/energy-prescription.commands.js';
import { NutritionPlanCommands } from './application/commands/nutrition-plan.commands.js';
import { NutritionApi } from './application/nutrition-api.js';
import { NutritionTimelineSource } from './application/nutrition-timeline.js';
import { PlanCalculator } from './application/plan-calculator.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  NUTRITION_PLAN_STORE,
} from './application/ports/nutrition.ports.js';
import { EnergyPrescriptionQueries } from './application/queries/energy-prescription.queries.js';
import { NutritionPlanQueries } from './application/queries/nutrition-plan.queries.js';
import {
  EnergyPrescriptionController,
  PatientEnergyController,
} from './adapters/in/http/energy-prescription.controller.js';
import {
  NutritionPlanController,
  PatientNutritionPlanController,
} from './adapters/in/http/nutrition-plan.controller.js';
import { PrismaEnergyPrescriptionStore } from './adapters/out/persistence/prisma-energy-prescription.store.js';
import { PrismaNutritionPlanStore } from './adapters/out/persistence/prisma-nutrition-plan.store.js';

/**
 * nutrition (02 §2, núcleo): la prescripción energética (RF-17, RF-18) y los planes por intercambios (RF-19). Pide la
 * composición a assessment, las actividades a exercise y los alimentos y las listas de intercambio a food, por sus API
 * públicas.
 */
@Module({
  imports: [AssessmentModule, ExerciseModule, FoodModule],
  controllers: [
    PatientEnergyController,
    EnergyPrescriptionController,
    PatientNutritionPlanController,
    NutritionPlanController,
  ],
  providers: [
    EnergyPrescriptionCommands,
    EnergyPrescriptionQueries,
    NutritionPlanCommands,
    NutritionPlanQueries,
    PlanCalculator,
    NutritionApi,
    NutritionTimelineSource,
    { provide: ENERGY_PRESCRIPTION_STORE, useClass: PrismaEnergyPrescriptionStore },
    { provide: NUTRITION_PLAN_STORE, useClass: PrismaNutritionPlanStore },
  ],
  exports: [NutritionApi],
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
