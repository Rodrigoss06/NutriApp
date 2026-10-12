import { Test, type TestingModule } from '@nestjs/testing';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CliModule } from '../../src/cli/cli.module.js';
import { ClinicalApi } from '../../src/modules/clinical/index.js';
import { IamApi, PATIENT_ENROLLMENT, type PatientEnrollment } from '../../src/modules/iam/index.js';
import {
  ACTIVE_PATIENT_COUNTER,
  type ActivePatientCounter,
} from '../../src/modules/tenancy/index.js';
import { id, pool } from './support/database.js';

/**
 * La CLI create-platform-admin contra PostgreSQL como app_user: arranca sin clinical, con un adaptador explícito para
 * cada puerto que clinical implementa en la API, que falla si alguien lo usa (ADR-040).
 */

let moduleRef: TestingModule;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({ imports: [CliModule] }).compile();
  await moduleRef.init();
});

afterAll(async () => {
  await moduleRef.close();
});

describe('CLI · primer administrador de plataforma', () => {
  it('arranca sin clinical y crea la cuenta de plataforma sin contraseña', async () => {
    expect(() => moduleRef.get(ClinicalApi, { strict: false })).toThrow();
    const email = `plataforma-${id()}@demo.test`;
    const created = await moduleRef.get(IamApi).createPlatformAdmin(email, 'Soporte de prueba');
    expect(created.ok).toBe(true);
    const { rows } = await pool('owner').query(
      `SELECT is_platform_admin, password_hash FROM iam.user_account WHERE email = $1`,
      [email],
    );
    expect(rows).toEqual([{ is_platform_admin: true, password_hash: null }]);
  });

  it('los puertos de clinical fallan con un mensaje claro si alguien los usa', async () => {
    const enrollment = moduleRef.get<PatientEnrollment>(PATIENT_ENROLLMENT);
    await expect(enrollment.patientOfAccount()).rejects.toThrow(
      'PATIENT_ENROLLMENT no está disponible en la CLI.',
    );
    const counter = moduleRef.get<ActivePatientCounter>(ACTIVE_PATIENT_COUNTER);
    await expect(counter.count(id() as OrganizationId)).rejects.toThrow(
      'ACTIVE_PATIENT_COUNTER no está disponible en la CLI.',
    );
  });
});
