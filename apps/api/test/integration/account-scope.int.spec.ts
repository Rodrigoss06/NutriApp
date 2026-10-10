import { beforeAll, describe, expect, it } from 'vitest';
import { id, pool, withContext, type SecurityContext } from './support/database.js';

/**
 * ACCOUNT existe solo dentro de la transacción que acepta una invitación de paciente. Aunque app.can_see_patient lo
 * deje pasar para su paciente, en los datos clínicos solo ve y escribe la ficha y los consentimientos: nunca historia,
 * condiciones, objetivos, notas, borradores ni registros (lista de lo permitido, como PATIENT).
 */

const owner = (sql: string, params: unknown[]) => pool('owner').query(sql, params);

let orgId: string;
let patientId: string;
let account: SecurityContext;

/** Tablas con care_team_scope (todas las que tienen patient_id, salvo las excepciones de ADR-037). */
async function careTeamTables(): Promise<{ name: string; column: string }[]> {
  const { rows } = await owner(
    `SELECT DISTINCT format('%I.%I', schemaname, tablename) AS name,
            CASE WHEN tablename = 'patient' AND schemaname = 'clinical' THEN 'id' ELSE 'patient_id' END AS column
     FROM pg_policies WHERE policyname = 'care_team_scope_select' ORDER BY 1`,
    [],
  );
  return rows as { name: string; column: string }[];
}

beforeAll(async () => {
  orgId = id();
  patientId = id();
  const memberId = id();
  const memberUserId = id();
  const userId = id();
  const email = `paciente-${userId}@demo.test`;
  await owner(`INSERT INTO tenancy.organization (id, name, slug) VALUES ($1, 'Org ACCOUNT', $2)`, [
    orgId,
    `org-${orgId}`,
  ]);
  await owner(
    `INSERT INTO tenancy.member (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'PROFESSIONAL')`,
    [memberId, orgId, memberUserId],
  );
  await owner(
    `INSERT INTO clinical.patient (id, organization_id, code, first_name, last_name, sex, birth_date,
                                   responsible_member_id, created_by)
     VALUES ($1, $2, 'P-000001', 'Paciente', 'Sintético', 'F', '1990-01-01', $3, $4)`,
    [patientId, orgId, memberId, memberUserId],
  );
  await owner(
    `INSERT INTO clinical.care_team_member (patient_id, member_id, organization_id, role, added_by)
     VALUES ($1, $2, $3, 'RESPONSIBLE', $4)`,
    [patientId, memberId, orgId, memberUserId],
  );
  await owner(
    `INSERT INTO clinical.clinical_history (id, organization_id, patient_id, revision, form_code, form_version, answers,
                                            recorded_by)
     VALUES ($1, $2, $3, 1, 'ANAMNESIS', '1', '{}', $4)`,
    [id(), orgId, patientId, memberUserId],
  );
  await owner(
    `INSERT INTO clinical.condition (id, organization_id, patient_id, kind, label, created_by)
     VALUES ($1, $2, $3, 'ALLERGY', 'Maní', $4)`,
    [id(), orgId, patientId, memberUserId],
  );
  await owner(
    `INSERT INTO clinical.goal (id, organization_id, patient_id, kind, created_by) VALUES ($1, $2, $3, 'FAT_LOSS', $4)`,
    [id(), orgId, patientId, memberUserId],
  );
  await owner(
    `INSERT INTO clinical.clinical_note (id, organization_id, patient_id, author_member_id, body)
     VALUES ($1, $2, $3, $4, 'Nota')`,
    [id(), orgId, patientId, memberId],
  );
  await owner(
    `INSERT INTO clinical.consent (id, organization_id, patient_id, purpose, consent_document_id, granted_at, channel)
     VALUES ($1, $2, $3, 'HEALTH_DATA', '01926000-0000-7000-8000-000000000001', now(), 'IN_PERSON_DIGITAL')`,
    [id(), orgId, patientId],
  );
  await owner(
    `INSERT INTO tracking.food_log (id, local_date, organization_id, patient_id, logged_at, meal_slot_code, item_type,
                                    item_name, kcal, cho_g, protein_g, fat_g, in_plan, client_id, created_by)
     VALUES ($1, '2026-10-15', $2, $3, now(), 'LUNCH', 'FOOD', 'Arroz', 200, 44, 4, 0.5, false, $4, $5)`,
    [id(), orgId, patientId, id(), memberUserId],
  );
  await owner(
    `INSERT INTO iam.user_account (id, email, display_name, status) VALUES ($1, $2, 'Paciente', 'ACTIVE')`,
    [userId, email],
  );
  await owner(
    `INSERT INTO iam.invitation (id, organization_id, email, role, patient_id, token_hash, expires_at, accepted_at,
                                 invited_by)
     VALUES ($1, $2, $3, 'PATIENT', $4, $5, now() + interval '7 days', now(), $6)`,
    [id(), orgId, email, patientId, Buffer.from(id()), memberUserId],
  );
  account = { orgId, userId, role: 'ACCOUNT' };
});

describe('ACCOUNT · lista de lo permitido en los datos clínicos', () => {
  it('tabla por tabla: solo ve su ficha y sus consentimientos', async () => {
    const tables = await careTeamTables();
    expect(tables.length).toBeGreaterThan(30);
    const visible: Record<string, number> = {};
    for (const { name, column } of tables) {
      // Cada tabla en su transacción: una lectura denegada no contamina a las demás.
      visible[name] = await withContext('user', account, async (client) => {
        const result = await client.query(
          `SELECT count(*)::int AS n FROM ${name} WHERE ${column} = $1`,
          [patientId],
        );
        return (result.rows[0] as { n: number }).n;
      });
    }
    const seen = Object.entries(visible)
      .filter(([, n]) => n > 0)
      .map(([name]) => name);
    expect(seen.sort()).toEqual(['clinical.consent', 'clinical.patient']);
  });

  it('el mismo dato sí lo ve el responsable: lo que oculta es la política, no la falta de filas', async () => {
    const counts = await withContext(
      'user',
      { orgId, role: 'OWNER' },
      async (client) =>
        (
          await client.query(
            `SELECT (SELECT count(*) FROM clinical.clinical_history WHERE patient_id = $1)::int AS history,
                    (SELECT count(*) FROM clinical.condition WHERE patient_id = $1)::int AS conditions,
                    (SELECT count(*) FROM tracking.food_log WHERE patient_id = $1)::int AS food`,
            [patientId],
          )
        ).rows[0] as Record<string, number>,
    );
    expect(counts).toEqual({ history: 1, conditions: 1, food: 1 });
  });

  it('no escribe historia ni notas, pero sí vincula su ficha y da sus consentimientos', async () => {
    const denied = await withContext('user', account, async (client) => {
      try {
        await client.query(
          `INSERT INTO clinical.clinical_history (id, organization_id, patient_id, revision, form_code, form_version,
                                                  answers, recorded_by)
           VALUES ($1, $2, $3, 9, 'ANAMNESIS', '1', '{}', $4)`,
          [id(), orgId, patientId, account.userId],
        );
        return null;
      } catch (error) {
        return (error as { code?: string }).code;
      }
    });
    expect(denied).toBe('42501');
    const linked = await withContext('user', account, async (client) => {
      const updated = await client.query(`UPDATE clinical.patient SET user_id = $1 WHERE id = $2`, [
        account.userId,
        patientId,
      ]);
      await client.query(
        `INSERT INTO clinical.consent (id, organization_id, patient_id, purpose, consent_document_id, granted_at,
                                       channel)
         VALUES ($1, $2, $3, 'APP_ACCESS', '01926000-0000-7000-8000-000000000002', now(), 'APP')`,
        [id(), orgId, patientId],
      );
      return updated.rowCount;
    });
    expect(linked).toBe(1);
  });
});
