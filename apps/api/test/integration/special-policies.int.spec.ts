import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { errorCode, id, PG, pool, withContext } from './support/database.js';
import { createTenant, ensureGlobalCatalog, LOCAL_DATE, type Tenant } from './support/fixtures.js';

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  await ensureGlobalCatalog();
  a = await createTenant('A');
  b = await createTenant('B');
});

const owner = (sql: string, params: unknown[] = []) => pool('owner').query(sql, params);
/** El miembro del fixture es OWNER: ve a todos los pacientes de su organización (RN-A05). */
const professional = (t: Tenant) => ({
  orgId: t.orgId,
  userId: t.memberUserId,
  role: 'OWNER' as const,
});
const patient = (t: Tenant) => ({
  orgId: t.orgId,
  userId: id(),
  role: 'PATIENT' as const,
  patientId: t.patientId,
});

describe('05 §3 · organización y miembros', () => {
  it('sin organización activa, el usuario ve solo las organizaciones donde es miembro', async () => {
    await withContext('user', { userId: a.memberUserId }, async (client) => {
      const { rows } = await client.query<{ id: string }>('SELECT id FROM tenancy.organization');
      expect(rows.map((r) => r.id)).toEqual([a.orgId]);
    });
  });

  it('crear una organización: el dominio genera su id y la transacción lo fija como app.org_id', async () => {
    const orgId = id();
    await withContext('user', { orgId, role: 'OWNER' }, async (client) => {
      expect(
        await errorCode(
          client,
          `INSERT INTO tenancy.organization (id, name, slug) VALUES ($1, 'Nueva', $2)`,
          [orgId, `nueva-${orgId}`],
        ),
      ).toBeUndefined();
      expect(
        await errorCode(
          client,
          `INSERT INTO tenancy.organization (id, name, slug) VALUES ($1, 'Otra', $2)`,
          [id(), `otra-${orgId}`],
        ),
      ).toBe(PG.insufficientPrivilege);
    });
  });
});

describe('RN-A06 · invitación', () => {
  it('sin sesión, solo app.find_invitation la encuentra, por el hash exacto y con lo necesario', async () => {
    const token = createHash('sha256').update(id()).digest();
    await owner(
      `INSERT INTO iam.invitation (id, organization_id, email, role, token_hash, expires_at, invited_by)
       VALUES ($1, $2, 'invitado@example.test', 'PROFESSIONAL', $3, now() + interval '7 days', $4)`,
      [id(), a.orgId, token, a.memberUserId],
    );

    await withContext('user', {}, async (client) => {
      expect((await client.query('SELECT 1 FROM iam.invitation')).rows).toHaveLength(0);
      const { rows } = await client.query('SELECT * FROM app.find_invitation($1)', [token]);
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0] as object).sort()).toEqual([
        'accepted_at',
        'email',
        'expires_at',
        'id',
        'organization_id',
        'patient_id',
        'revoked_at',
        'role',
      ]);
      expect(rows[0]).toMatchObject({ organization_id: a.orgId });
      const other = await client.query('SELECT * FROM app.find_invitation($1)', [Buffer.alloc(32)]);
      expect(other.rows).toHaveLength(0);
    });
  });

  it('una invitación no se edita: solo se acepta o se revoca', async () => {
    await withContext('user', professional(a), async (client) => {
      expect(await errorCode(client, `UPDATE iam.invitation SET role = 'OWNER'`)).toBe(
        PG.insufficientPrivilege,
      );
      expect(
        await errorCode(client, `UPDATE iam.invitation SET revoked_at = now()`),
      ).toBeUndefined();
    });
  });
});

describe('RN-G01 · el paciente solo ve lo permitido y escribe solo sus registros', () => {
  it('ve su ficha y sus registros, no los de otro paciente ni su historia clínica', async () => {
    await withContext('user', patient(a), async (client) => {
      const patients = await client.query<{ id: string }>('SELECT id FROM clinical.patient');
      expect(patients.rows.map((r) => r.id)).toEqual([a.patientId]);
      const logs = await client.query<{ patient_id: string }>(
        'SELECT DISTINCT patient_id FROM tracking.food_log',
      );
      expect(logs.rows.map((r) => r.patient_id)).toEqual([a.patientId]);
      expect((await client.query('SELECT 1 FROM clinical.clinical_history')).rows).toHaveLength(0);
      expect((await client.query('SELECT 1 FROM tenancy.member')).rows).toHaveLength(0);
      expect((await client.query('SELECT 1 FROM audit.audit_log')).rows).toHaveLength(0);
    });
  });

  it('crea sus registros, no los de otro paciente; anula sin poder cambiar lo registrado (RN-G12)', async () => {
    const insert = `INSERT INTO tracking.hydration_log (id, local_date, organization_id, patient_id, logged_at,
                                                         volume_ml, client_id)
                    VALUES ($1, $2, $3, $4, now(), 250, $5)`;
    await withContext('user', patient(a), async (client) => {
      expect(
        await errorCode(client, insert, [id(), LOCAL_DATE, a.orgId, a.patientId, id()]),
      ).toBeUndefined();
      expect(
        await errorCode(client, insert, [id(), LOCAL_DATE, a.orgId, a.otherPatientId, id()]),
      ).toBe(PG.insufficientPrivilege);
      expect(
        await errorCode(client, `UPDATE tracking.food_log SET status = 'VOIDED'`),
      ).toBeUndefined();
      expect(await errorCode(client, `UPDATE tracking.food_log SET kcal = 1`)).toBe(
        PG.insufficientPrivilege,
      );
    });
  });

  it('ve sus evaluaciones cerradas, no los borradores; no ve planes ni rutinas, solo su copia publicada', async () => {
    for (const status of ['DRAFT', 'CLOSED']) {
      await owner(
        `INSERT INTO assessment.evaluation (id, organization_id, patient_id, evaluator_member_id, measured_at,
                                            local_date, patient_snapshot, status, created_by)
         VALUES ($1, $2, $3, $4, now(), $5, '{}', $6, $4)`,
        [id(), a.orgId, a.patientId, a.memberUserId, LOCAL_DATE, status],
      );
    }
    await owner(
      `INSERT INTO nutrition.plan (id, organization_id, patient_id, lineage_id, version_no, modality,
                                   target_kcal, target_cho_g, target_protein_g, target_fat_g, created_by)
       VALUES ($1, $2, $3, $1, 1, 'EXCHANGES', 1835, 184, 160, 51, $4)`,
      [id(), a.orgId, a.patientId, a.memberUserId],
    );
    await owner(
      `INSERT INTO tracking.active_plan_view (patient_id, organization_id, effective_from) VALUES ($1, $2, $3)`,
      [a.patientId, a.orgId, LOCAL_DATE],
    );

    await withContext('user', patient(a), async (client) => {
      const evaluations = await client.query<{ status: string }>(
        'SELECT status FROM assessment.evaluation',
      );
      expect(evaluations.rows.map((r) => r.status)).toEqual(['CLOSED']);
      expect((await client.query('SELECT 1 FROM nutrition.plan')).rows).toHaveLength(0);
      expect((await client.query('SELECT 1 FROM tracking.active_plan_view')).rows).toHaveLength(1);
    });
  });

  it('otorga y revoca su consentimiento, nada más del consentimiento cambia', async () => {
    const documentId = id();
    await owner(
      `INSERT INTO clinical.consent_document (id, organization_id, purpose, version, body_markdown, sha256)
       VALUES ($1, NULL, 'HEALTH_DATA', $2, 'Texto', '\\x00')`,
      [documentId, documentId],
    );
    await withContext('user', patient(a), async (client) => {
      const insert = `INSERT INTO clinical.consent (id, organization_id, patient_id, purpose, consent_document_id,
                                                    granted_at, channel)
                      VALUES ($1, $2, $3, 'HEALTH_DATA', $4, now(), 'APP')`;
      expect(
        await errorCode(client, insert, [id(), a.orgId, a.patientId, documentId]),
      ).toBeUndefined();
      expect(await errorCode(client, insert, [id(), a.orgId, a.otherPatientId, documentId])).toBe(
        PG.insufficientPrivilege,
      );
      expect(
        await errorCode(client, 'UPDATE clinical.consent SET revoked_at = now()'),
      ).toBeUndefined();
      expect(await errorCode(client, 'UPDATE clinical.consent SET granted_at = now()')).toBe(
        PG.insufficientPrivilege,
      );
    });
  });
});

describe('RN-A09 · soporte de la plataforma', () => {
  it('sin permiso clínico no ve pacientes; con permiso los lee, pero nunca escribe', async () => {
    const supportUserId = id();
    const admin = { orgId: a.orgId, userId: supportUserId, role: 'PLATFORM_ADMIN' as const };

    await withContext('user', admin, async (client) => {
      expect((await client.query('SELECT 1 FROM clinical.patient')).rows).toHaveLength(0);
      expect(
        (await client.query('SELECT 1 FROM tenancy.organization')).rows.length,
      ).toBeGreaterThan(0);
    });

    await owner(
      `INSERT INTO tenancy.support_access_grant (id, organization_id, support_user_id, scope, reason, granted_by,
                                                 expires_at)
       VALUES ($1, $2, $3, 'CLINICAL_READ', 'Revisión de un error reportado', $4, now() + interval '1 hour')`,
      [id(), a.orgId, supportUserId, a.memberUserId],
    );

    await withContext('user', admin, async (client) => {
      expect((await client.query('SELECT 1 FROM clinical.patient')).rows).toHaveLength(2);
      expect(await errorCode(client, `UPDATE clinical.patient SET tags = '{}'`)).toBe(
        PG.insufficientPrivilege,
      );
      expect(
        await errorCode(
          client,
          `INSERT INTO clinical.goal (id, organization_id, patient_id, kind, created_by)
           VALUES ($1, $2, $3, 'HEALTH', $4)`,
          [id(), a.orgId, a.patientId, supportUserId],
        ),
      ).toBe(PG.insufficientPrivilege);
    });

    await withContext('user', { ...admin, orgId: b.orgId }, async (client) => {
      expect((await client.query('SELECT 1 FROM clinical.patient')).rows).toHaveLength(0);
    });
  });
});

describe('05 §3 · outbox y auditoría', () => {
  it('el outbox se escribe sin RETURNING; solo SYSTEM lo lee', async () => {
    const insert = `INSERT INTO platform.outbox_event (id, organization_id, aggregate_type, aggregate_id, event_type,
                                                       payload, occurred_at)
                    VALUES ($1, $2, 'Patient', $3, 'clinical.patient.registered', '{}', now())`;
    const eventId = id();
    await withContext('user', professional(a), async (client) => {
      expect(await errorCode(client, insert, [eventId, a.orgId, a.patientId])).toBeUndefined();
      expect(await errorCode(client, `${insert} RETURNING id`, [id(), a.orgId, a.patientId])).toBe(
        PG.insufficientPrivilege,
      );
      expect((await client.query('SELECT 1 FROM platform.outbox_event')).rows).toHaveLength(0);
      expect(await errorCode(client, insert, [id(), b.orgId, b.patientId])).toBe(
        PG.insufficientPrivilege,
      );
    });
  });

  it('RN-B03 · la auditoría solo se agrega: app_user no la modifica ni la borra', async () => {
    await withContext('user', professional(a), async (client) => {
      expect(
        await errorCode(
          client,
          `INSERT INTO audit.audit_log (id, occurred_at, organization_id, action, resource_type)
           VALUES ($1, now(), $2, 'EXPORT', 'patient')`,
          [id(), a.orgId],
        ),
      ).toBeUndefined();
      expect(await errorCode(client, `UPDATE audit.audit_log SET outcome = 'X'`)).toBe(
        PG.insufficientPrivilege,
      );
      expect(await errorCode(client, 'DELETE FROM audit.audit_log')).toBe(PG.insufficientPrivilege);
    });
  });
});

describe('RN-C07 · RN-D08 · RN-E15 · lo cerrado o publicado no cambia', () => {
  it('un plan publicado solo pasa a SUPERSEDED o ARCHIVED', async () => {
    const planId = id();
    await owner(
      `INSERT INTO nutrition.plan (id, organization_id, patient_id, lineage_id, version_no, modality, status,
                                   target_kcal, target_cho_g, target_protein_g, target_fat_g, created_by)
       VALUES ($1, $2, $3, $1, 1, 'EXCHANGES', 'PUBLISHED', 1835, 184, 160, 51, $4)`,
      [planId, a.orgId, a.otherPatientId, a.memberUserId],
    );
    await withContext('user', professional(a), async (client) => {
      expect(
        await errorCode(client, 'UPDATE nutrition.plan SET target_kcal = 1 WHERE id = $1', [
          planId,
        ]),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(client, `UPDATE nutrition.plan SET status = 'SUPERSEDED' WHERE id = $1`, [
          planId,
        ]),
      ).toBeUndefined();
    });
  });

  it('una evaluación cerrada y sus tomas no cambian; solo se enmienda', async () => {
    const evaluationId = id();
    await owner(
      `INSERT INTO assessment.evaluation (id, organization_id, patient_id, evaluator_member_id, measured_at,
                                          local_date, patient_snapshot, status, created_by)
       VALUES ($1, $2, $3, $4, now(), $5, '{}', 'DRAFT', $4)`,
      [evaluationId, a.orgId, a.patientId, a.memberUserId, LOCAL_DATE],
    );
    await withContext('user', professional(a), async (client) => {
      const measure = `INSERT INTO assessment.measurement (evaluation_id, site_code, organization_id, attempt_1)
                       VALUES ($1, 'SKF_TRICEPS', $2, 12)`;
      expect(await errorCode(client, measure, [evaluationId, a.orgId])).toBeUndefined();
      await client.query(`UPDATE assessment.evaluation SET status = 'CLOSED' WHERE id = $1`, [
        evaluationId,
      ]);
      expect(
        await errorCode(
          client,
          'UPDATE assessment.measurement SET attempt_1 = 13 WHERE evaluation_id = $1',
          [evaluationId],
        ),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(client, `UPDATE assessment.evaluation SET notes = 'x' WHERE id = $1`, [
          evaluationId,
        ]),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(
          client,
          `UPDATE assessment.evaluation SET status = 'AMENDED' WHERE id = $1`,
          [evaluationId],
        ),
      ).toBeUndefined();
    });
  });

  it('un resultado solo cambia su estado y su reemplazo; la historia clínica no se actualiza', async () => {
    await withContext('user', professional(a), async (client) => {
      expect(
        await errorCode(client, `UPDATE assessment.calculation_result SET outputs = '{}'`),
      ).toBe(PG.insufficientPrivilege);
      expect(
        await errorCode(client, `UPDATE assessment.calculation_result SET status = 'SUPERSEDED'`),
      ).toBeUndefined();
      expect(await errorCode(client, `UPDATE clinical.clinical_history SET answers = '{}'`)).toBe(
        PG.insufficientPrivilege,
      );
      expect(await errorCode(client, `UPDATE documents.generated_document SET kind = 'x'`)).toBe(
        PG.insufficientPrivilege,
      );
    });
  });
});

describe('ADR-024 · una serie apunta a un entrenamiento existente', () => {
  it('el disparador reemplaza la FK sobre tablas particionadas', async () => {
    const workoutId = id();
    const insertSet = `INSERT INTO tracking.set_log (id, local_date, organization_id, patient_id, workout_log_id,
                                                     exercise_id, exercise_name, muscle_contributions, set_no,
                                                     reps, load_kg, client_id)
                       VALUES ($1, $2, $3, $4, $5, $6, 'Sentadilla', '[]', 1, 8, 100, $7)`;
    await withContext('user', patient(a), async (client) => {
      expect(
        await errorCode(client, insertSet, [
          id(),
          LOCAL_DATE,
          a.orgId,
          a.patientId,
          workoutId,
          id(),
          id(),
        ]),
      ).toBe(PG.foreignKeyViolation);
      await client.query(
        `INSERT INTO tracking.workout_log (id, local_date, organization_id, patient_id, outcome, client_id)
         VALUES ($1, $2, $3, $4, 'COMPLETED', $5)`,
        [workoutId, LOCAL_DATE, a.orgId, a.patientId, id()],
      );
      expect(
        await errorCode(client, insertSet, [
          id(),
          LOCAL_DATE,
          a.orgId,
          a.patientId,
          workoutId,
          id(),
          id(),
        ]),
      ).toBeUndefined();
      const { rows } = await client.query<{ tonnage_kg: string }>(
        'SELECT tonnage_kg FROM tracking.set_log WHERE workout_log_id = $1',
        [workoutId],
      );
      expect(rows.map((r) => Number(r.tonnage_kg))).toEqual([800]);
    });
  });
});

describe('05 §5 · particiones', () => {
  it('app.ensure_monthly_partitions solo acepta las nueve tablas particionadas', async () => {
    await withContext('user', { role: 'SYSTEM' }, async (client) => {
      expect(
        await errorCode(client, `SELECT app.ensure_monthly_partitions('clinical.patient')`),
      ).toBe('22023');
      const { rows } = await client.query<{ created: number }>(
        `SELECT app.ensure_monthly_partitions('tracking.food_log', 3) AS created`,
      );
      expect(rows[0]?.created).toBe(0);
    });
  });
});
