import { beforeAll, describe, expect, it } from 'vitest';
import { errorCode, id, PG, pool, withContext } from './support/database.js';
import { createTenant, ensureGlobalCatalog, type Tenant } from './support/fixtures.js';

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  await ensureGlobalCatalog();
  await pool('owner').query(
    `INSERT INTO food.food (id, organization_id, source_code, name_es) VALUES ($1, NULL, 'ORG', 'Global')`,
    [id()],
  );
  a = await createTenant('A');
  b = await createTenant('B');
});

/** El miembro del fixture es OWNER: ve a todos los pacientes de su organización (RN-A05). */
const professional = (t: Tenant) => ({
  orgId: t.orgId,
  userId: t.memberUserId,
  role: 'OWNER' as const,
});

describe('RN-A01 · dos organizaciones no se ven entre sí', () => {
  it('ni siquiera con un WHERE olvidado: ninguna tabla deja ver filas de otra organización', async () => {
    const tables = (
      await pool('owner').query<{ name: string }>(
        `SELECT format('%I.%I', n.nspname, c.relname) AS name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relrowsecurity AND NOT c.relispartition
           AND EXISTS (SELECT 1 FROM pg_attribute x
                       WHERE x.attrelid = c.oid AND x.attname = 'organization_id' AND NOT x.attisdropped)`,
      )
    ).rows.map((r) => r.name);

    await withContext('user', professional(a), async (client) => {
      for (const table of tables) {
        const { rows } = await client.query<{ foreign: string }>(
          `SELECT count(*) AS foreign FROM ${table}
           WHERE organization_id IS NOT NULL AND organization_id <> app.org_id()`,
        );
        expect({ table, foreign: Number(rows[0]?.foreign) }).toEqual({ table, foreign: 0 });
      }
    });
  });

  it('la lista de pacientes, el día de registros y la auditoría solo traen la organización activa', async () => {
    await withContext('user', professional(a), async (client) => {
      for (const table of ['clinical.patient', 'tracking.food_log', 'audit.audit_log']) {
        const { rows } = await client.query<{ organization_id: string }>(
          `SELECT DISTINCT organization_id FROM ${table}`,
        );
        expect(rows.map((r) => r.organization_id)).toEqual([a.orgId]);
      }
    });
  });

  it('sin contexto no se ve nada: la RLS falla cerrada', async () => {
    await withContext('user', {}, async (client) => {
      const { rows } = await client.query('SELECT 1 FROM clinical.patient');
      expect(rows).toHaveLength(0);
    });
  });

  it('no se escribe en otra organización: ni al insertar ni al mover una fila', async () => {
    await withContext('user', professional(a), async (client) => {
      expect(
        await errorCode(
          client,
          `INSERT INTO clinical.goal (id, organization_id, patient_id, kind, created_by)
           VALUES ($1, $2, $3, 'HEALTH', $4)`,
          [id(), b.orgId, b.patientId, a.memberUserId],
        ),
      ).toBe(PG.insufficientPrivilege);
      expect(
        await errorCode(client, `UPDATE clinical.patient SET organization_id = $1 WHERE id = $2`, [
          b.orgId,
          a.patientId,
        ]),
      ).toBe(PG.insufficientPrivilege);
      const updated = await client.query(`UPDATE clinical.patient SET tags = '{x}' WHERE id = $1`, [
        b.patientId,
      ]);
      expect(updated.rowCount).toBe(0);
    });
  });

  it('app_readonly también está sujeto a la RLS', async () => {
    await withContext('readonly', professional(a), async (client) => {
      const { rows } = await client.query<{ organization_id: string }>(
        'SELECT DISTINCT organization_id FROM clinical.patient',
      );
      expect(rows.map((r) => r.organization_id)).toEqual([a.orgId]);
      expect(await errorCode(client, `UPDATE clinical.patient SET tags = '{}'`)).toBe(
        PG.insufficientPrivilege,
      );
    });
  });

  it('RN-I01 · catálogos: se lee lo global y lo propio; lo global solo lo escribe SYSTEM', async () => {
    await withContext('user', professional(a), async (client) => {
      const { rows } = await client.query<{ organization_id: string | null }>(
        'SELECT DISTINCT organization_id FROM food.food ORDER BY 1 NULLS FIRST',
      );
      expect(rows.map((r) => r.organization_id)).toEqual([null, a.orgId]);
      expect(
        await errorCode(
          client,
          `INSERT INTO food.food (id, organization_id, source_code, name_es) VALUES ($1, NULL, 'ORG', 'x')`,
          [id()],
        ),
      ).toBe(PG.insufficientPrivilege);
      expect(
        await errorCode(client, `UPDATE food.food SET name_es = 'x' WHERE organization_id IS NULL`),
      ).toBe(undefined);
      const { rows: unchanged } = await client.query(`SELECT 1 FROM food.food WHERE name_es = 'x'`);
      expect(unchanged).toHaveLength(0);
    });
    await withContext('user', { role: 'SYSTEM' }, async (client) => {
      expect(
        await errorCode(
          client,
          `INSERT INTO food.food (id, organization_id, source_code, source_food_code, name_es)
           VALUES ($1, NULL, 'ORG', $2, 'Carga')`,
          [id(), id()],
        ),
      ).toBeUndefined();
    });
  });
});
