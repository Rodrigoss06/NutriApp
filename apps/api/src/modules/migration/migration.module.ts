import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/index.js';
import { NutritionModule } from '../nutrition/index.js';
import { AccountImporter } from './application/account-importer.js';

/**
 * migration (RF-40, Paquete B; ADR-135): la migración de las cuentas de nutricionista desde la plantilla CSV propia. Sin HTTP: la
 * corre un administrador de plataforma con la CLI account:import. Cada contexto importa lo suyo con su caso de uso; este módulo
 * valida la carpeta, los llama fila por fila y arma el informe. clinical, iam y tenancy son globales.
 */
@Module({
  imports: [AssessmentModule, NutritionModule],
  providers: [AccountImporter],
  exports: [AccountImporter],
})
export class MigrationModule {}
