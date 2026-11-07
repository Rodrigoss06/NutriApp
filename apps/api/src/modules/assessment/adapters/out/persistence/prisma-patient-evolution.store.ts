import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  PatientEvolutionSite,
  PatientEvolutionStore,
} from '../../../application/ports/assessment.ports.js';
import type { MethodPurpose, PreferenceRow } from '../../../domain/calculation-plan.js';

type Dec = { toString(): string } | null;
const num = (value: Dec): number | null => (value === null ? null : Number(value));

/**
 * La evolución del paciente desde su propia sesión (ADR-091): app.patient_evolution_sites y app.patient_method_preferences
 * (SECURITY DEFINER) devuelven solo lo suyo y solo con app.role() = PATIENT; para cualquier otra sesión, nada.
 */
@Injectable()
export class PrismaPatientEvolutionStore implements PatientEvolutionStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async sites(): Promise<readonly PatientEvolutionSite[]> {
    const rows = await this.db.tx.$queryRaw<
      {
        evaluation_id: string;
        site_code: string;
        attempt_1: Dec;
        attempt_2: Dec;
        attempt_3: Dec;
        tem_abs: Dec;
        tem_pairs: unknown;
      }[]
    >`SELECT evaluation_id, site_code, attempt_1, attempt_2, attempt_3, tem_abs, tem_pairs
      FROM app.patient_evolution_sites()`;
    return rows.map((row) => ({
      evaluationId: row.evaluation_id,
      siteCode: row.site_code,
      attempts: [row.attempt_1, row.attempt_2, row.attempt_3]
        .map(num)
        .filter((value): value is number => value !== null),
      temAbs: num(row.tem_abs),
      // Se guardaron validados con su contrato: pares de dos números.
      pairs: (row.tem_pairs as [number, number][] | null) ?? null,
    }));
  }

  async preferences(): Promise<readonly PreferenceRow[]> {
    const rows = await this.db.tx.$queryRaw<
      {
        organization_level: boolean;
        population: string | null;
        purpose: string;
        method_code: string;
      }[]
    >`SELECT organization_level, population, purpose, method_code FROM app.patient_method_preferences()`;
    return rows.map((row) => ({
      organizationLevel: row.organization_level,
      population: row.population as PreferenceRow['population'],
      purpose: row.purpose as MethodPurpose,
      methodCode: row.method_code,
    }));
  }
}
