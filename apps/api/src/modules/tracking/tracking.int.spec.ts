import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ApiHarness,
  type StaffOrganization,
} from '../../../test/integration/support/api-harness.js';
import { id as uuid, pool } from '../../../test/integration/support/database.js';
import { patientWithConsent } from '../../../test/integration/support/luis.js';
import { DailyTargetsHandler } from './application/daily-targets.handler.js';

/**
 * RN-G03 · RN-G04: el trabajo de cada hora contra PostgreSQL, con lo que ya dejaron los consumidores en active_plan_view. Vive junto
 * al código porque el handler no es parte de la API pública de tracking.
 */

const harness = new ApiHarness();
let org: StaffOrganization;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** La fecha local del paciente (RN-G04): en Lima, a veces todavía es ayer en UTC. */
const limaToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const newPatient = () =>
  patientWithConsent(harness, org, {
    firstName: 'Paciente',
    lastName: 'Sintético',
    sex: 'F',
    birthDate: '1995-03-02',
  });

/** Lo que deja publicar un programa: su copia, con el calendario que lee este trabajo. */
const withActiveProgram = (patientId: string, startDate: string) =>
  pool('owner').query(
    `INSERT INTO tracking.active_plan_view (patient_id, organization_id, training_program_id, training_snapshot, effective_from)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (patient_id) DO UPDATE
       SET training_program_id = excluded.training_program_id, training_snapshot = excluded.training_snapshot`,
    [
      patientId,
      org.organizationId,
      uuid(),
      JSON.stringify({
        publishedAt: new Date().toISOString(),
        startDate,
        schedule: {
          weeks: [
            {
              weekNo: 1,
              sessions: [{ position: 1, dayOfWeek: null, setsByMuscle: { QUADRICEPS: 3 } }],
            },
          ],
        },
      }),
      startDate,
    ],
  );

const withActivePlan = (patientId: string, today: string) =>
  pool('owner').query(
    `INSERT INTO tracking.active_plan_view (patient_id, organization_id, nutrition_plan_id, nutrition_snapshot, effective_from)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (patient_id) DO UPDATE
       SET nutrition_plan_id = excluded.nutrition_plan_id, nutrition_snapshot = excluded.nutrition_snapshot`,
    [
      patientId,
      org.organizationId,
      uuid(),
      JSON.stringify({
        publishedAt: new Date().toISOString(),
        targets: { kcal: 1800, choG: 200, proteinG: 120, fatG: 60 },
        hydrationTargetMl: 2_000,
      }),
      today,
    ],
  );

const run = () => harness.app.get(DailyTargetsHandler).execute();

const targetsOf = (patientId: string) =>
  owner<{
    local_date: Date;
    planned_sessions: number | null;
    planned_sets: object | null;
    kcal: string | null;
  }>(
    `SELECT local_date, planned_sessions, planned_sets, kcal FROM tracking.daily_target WHERE patient_id = $1`,
    [patientId],
  );

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-G03 · la meta de entrenamiento de cada día', () => {
  it('crea la de quien tiene un programa vigente, en su fecha local, y es idempotente', async () => {
    const patientId = await newPatient();
    await withActiveProgram(patientId, limaToday());

    expect(await run()).toBeGreaterThanOrEqual(1);
    const [created] = await targetsOf(patientId);
    expect(created).toMatchObject({
      planned_sessions: 1,
      planned_sets: { QUADRICEPS: 3 },
      kcal: null,
    });

    await run();
    expect(await targetsOf(patientId)).toHaveLength(1);
  });

  it('no reescribe la que el día ya tiene', async () => {
    const patientId = await newPatient();
    await withActiveProgram(patientId, limaToday());
    await run();
    await pool('owner').query(
      `UPDATE tracking.daily_target SET planned_sessions = 9 WHERE patient_id = $1`,
      [patientId],
    );

    await run();

    expect((await targetsOf(patientId))[0]?.planned_sessions).toBe(9);
  });

  it('un día de descanso tiene su meta en 0; fuera del programa no hay fila', async () => {
    const resting = await newPatient();
    const yesterday = new Date(`${limaToday()}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await withActiveProgram(resting, yesterday.toISOString().slice(0, 10));
    const future = await newPatient();
    await withActiveProgram(future, '2099-01-01');

    await run();

    expect(await targetsOf(resting)).toMatchObject([{ planned_sessions: 0, planned_sets: {} }]);
    expect(await targetsOf(future)).toEqual([]);
  });

  it('un paciente archivado no recibe meta', async () => {
    const patientId = await newPatient();
    await withActiveProgram(patientId, limaToday());
    const archived = await harness.post(
      `/patients/${patientId}/archive`,
      undefined,
      org.staff.responsible.cookie,
    );
    expect(archived.status, JSON.stringify(archived.body)).toBeLessThan(300);

    await run();

    expect(await targetsOf(patientId)).toEqual([]);
  });

  it('la meta de entrenamiento no impide la de la dieta del mismo día, ni al revés', async () => {
    const today = limaToday();
    const trainingFirst = await newPatient();
    await pool('owner').query(
      `INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, planned_sessions, planned_sets)
       VALUES ($1, $2, $3, 1, '{}')`,
      [trainingFirst, today, org.organizationId],
    );
    await withActivePlan(trainingFirst, today);
    const dietFirst = await newPatient();
    await withActivePlan(dietFirst, today);
    await run();
    await withActiveProgram(dietFirst, today);

    await run();

    const [first] = await targetsOf(trainingFirst);
    expect(Number(first?.kcal)).toBe(1800);
    expect(first?.planned_sessions).toBe(1);
    const [second] = await targetsOf(dietFirst);
    expect(Number(second?.kcal)).toBe(1800);
    expect(second?.planned_sessions).toBe(1);
  });

  it('la meta de la dieta no se reescribe si el día ya la tiene', async () => {
    const today = limaToday();
    const patientId = await newPatient();
    await pool('owner').query(
      `INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, nutrition_plan_id, kcal)
       VALUES ($1, $2, $3, $4, 1500)`,
      [patientId, today, org.organizationId, uuid()],
    );
    await withActivePlan(patientId, today);

    await run();

    expect(Number((await targetsOf(patientId))[0]?.kcal)).toBe(1500);
  });
});
