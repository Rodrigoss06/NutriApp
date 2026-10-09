import { beforeAll, describe, expect, it } from 'vitest';
import { id, pool, withContext, type SecurityContext } from './support/database.js';

/**
 * RN-A05 en la base: con visibilidad CARE_TEAM, ADMIN y PROFESSIONAL ven solo a los pacientes de los que son
 * responsables o miembros del equipo; OWNER ve a todos. La política care_team_scope se aplica en SELECT, UPDATE y
 * DELETE con app.can_see_patient (SECURITY DEFINER, sin recursión).
 */

const owner = (sql: string, params: unknown[]) => pool('owner').query(sql, params);

interface Org {
  orgId: string;
  members: Record<
    'owner' | 'admin' | 'responsible' | 'team' | 'outsider',
    { memberId: string; userId: string }
  >;
  patientId: string;
}

async function createOrg(visibility: 'CARE_TEAM' | 'ORGANIZATION'): Promise<Org> {
  const orgId = id();
  await owner(
    `INSERT INTO tenancy.organization (id, name, slug, patient_visibility) VALUES ($1, $2, $3, $4)`,
    [orgId, 'Organización RN-A05', `org-${orgId}`, visibility],
  );
  const roles = {
    owner: 'OWNER',
    admin: 'ADMIN',
    responsible: 'PROFESSIONAL',
    team: 'PROFESSIONAL',
    outsider: 'PROFESSIONAL',
  } as const;
  const members = {} as Org['members'];
  for (const [key, role] of Object.entries(roles) as [keyof typeof roles, string][]) {
    const member = { memberId: id(), userId: id() };
    await owner(
      `INSERT INTO tenancy.member (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)`,
      [member.memberId, orgId, member.userId, role],
    );
    members[key] = member;
  }
  const patientId = id();
  await owner(
    `INSERT INTO clinical.patient (id, organization_id, code, first_name, last_name, sex, birth_date,
                                   responsible_member_id, created_by)
     VALUES ($1, $2, 'P-000001', 'Paciente', 'Sintético', 'F', '1990-01-01', $3, $4)`,
    [patientId, orgId, members.responsible.memberId, members.responsible.userId],
  );
  await owner(
    `INSERT INTO clinical.care_team_member (patient_id, member_id, organization_id, role, added_by)
     VALUES ($1, $2, $3, 'COLLABORATOR', $4)`,
    [patientId, members.team.memberId, orgId, members.responsible.userId],
  );
  await owner(
    `INSERT INTO clinical.clinical_history (id, organization_id, patient_id, revision, form_code, form_version,
                                            answers, recorded_by)
     VALUES ($1, $2, $3, 1, 'ANAMNESIS', '1', '{}', $4)`,
    [id(), orgId, patientId, members.responsible.userId],
  );
  return { orgId, members, patientId };
}

const as = (org: Org, key: keyof Org['members']): SecurityContext => ({
  orgId: org.orgId,
  userId: org.members[key].userId,
  memberId: org.members[key].memberId,
  role: key === 'owner' ? 'OWNER' : key === 'admin' ? 'ADMIN' : 'PROFESSIONAL',
});

const visible = (context: SecurityContext, patientId: string) =>
  withContext('user', context, async (client) => {
    const patients = await client.query(`SELECT 1 FROM clinical.patient WHERE id = $1`, [
      patientId,
    ]);
    const history = await client.query(
      `SELECT 1 FROM clinical.clinical_history WHERE patient_id = $1`,
      [patientId],
    );
    const team = await client.query(
      `SELECT 1 FROM clinical.care_team_member WHERE patient_id = $1`,
      [patientId],
    );
    return { patient: patients.rowCount, history: history.rowCount, team: team.rowCount };
  });

let careTeam: Org;
let organization: Org;

beforeAll(async () => {
  careTeam = await createOrg('CARE_TEAM');
  organization = await createOrg('ORGANIZATION');
});

describe('RN-A05 · care_team_scope', () => {
  it('con CARE_TEAM ven al paciente el responsable, el equipo y OWNER; ADMIN y los demás no', async () => {
    expect(await visible(as(careTeam, 'responsible'), careTeam.patientId)).toEqual({
      patient: 1,
      history: 1,
      team: 1,
    });
    expect(await visible(as(careTeam, 'team'), careTeam.patientId)).toEqual({
      patient: 1,
      history: 1,
      team: 1,
    });
    expect(await visible(as(careTeam, 'owner'), careTeam.patientId)).toEqual({
      patient: 1,
      history: 1,
      team: 1,
    });
    expect(await visible(as(careTeam, 'admin'), careTeam.patientId)).toEqual({
      patient: 0,
      history: 0,
      team: 0,
    });
    expect(await visible(as(careTeam, 'outsider'), careTeam.patientId)).toEqual({
      patient: 0,
      history: 0,
      team: 0,
    });
  });

  it('con ORGANIZATION todos los miembros ven a todos', async () => {
    expect(await visible(as(organization, 'outsider'), organization.patientId)).toEqual({
      patient: 1,
      history: 1,
      team: 1,
    });
    expect(await visible(as(organization, 'admin'), organization.patientId)).toEqual({
      patient: 1,
      history: 1,
      team: 1,
    });
  });

  it('quien no ve al paciente tampoco lo modifica ni le cambia el equipo', async () => {
    const updated = await withContext('user', as(careTeam, 'outsider'), (client) =>
      client.query(`UPDATE clinical.patient SET tags = '{x}' WHERE id = $1`, [careTeam.patientId]),
    );
    const removed = await withContext('user', as(careTeam, 'outsider'), (client) =>
      client.query(`DELETE FROM clinical.care_team_member WHERE patient_id = $1`, [
        careTeam.patientId,
      ]),
    );
    expect(updated.rowCount).toBe(0);
    expect(removed.rowCount).toBe(0);
  });

  it('INSERT solo exige la organización: el paciente se crea antes que su fila de equipo', async () => {
    const patientId = id();
    await withContext('user', as(careTeam, 'outsider'), async (client) => {
      await client.query(
        `INSERT INTO clinical.patient (id, organization_id, code, first_name, last_name, sex, birth_date,
                                       responsible_member_id, created_by)
         VALUES ($1, $2, 'P-000099', 'Nuevo', 'Sintético', 'M', '1990-01-01', $3, $4)`,
        [
          patientId,
          careTeam.orgId,
          careTeam.members.outsider.memberId,
          careTeam.members.outsider.userId,
        ],
      );
      await client.query(
        `INSERT INTO clinical.care_team_member (patient_id, member_id, organization_id, role, added_by)
         VALUES ($1, $2, $3, 'RESPONSIBLE', $4)`,
        [
          patientId,
          careTeam.members.outsider.memberId,
          careTeam.orgId,
          careTeam.members.outsider.userId,
        ],
      );
      const { rowCount } = await client.query(`SELECT 1 FROM clinical.patient WHERE id = $1`, [
        patientId,
      ]);
      expect(rowCount).toBe(1);
    });
  });

  it('una nota AUTHOR_ONLY la ve solo su autor, también frente a OWNER', async () => {
    const noteId = id();
    await owner(
      `INSERT INTO clinical.clinical_note (id, organization_id, patient_id, author_member_id, body, visibility)
       VALUES ($1, $2, $3, $4, 'Nota privada', 'AUTHOR_ONLY')`,
      [noteId, careTeam.orgId, careTeam.patientId, careTeam.members.responsible.memberId],
    );
    const count = (key: keyof Org['members']) =>
      withContext(
        'user',
        as(careTeam, key),
        async (client) =>
          (await client.query(`SELECT 1 FROM clinical.clinical_note WHERE id = $1`, [noteId]))
            .rowCount,
      );
    expect(await count('responsible')).toBe(1);
    expect(await count('owner')).toBe(0);
    expect(await count('team')).toBe(0);
  });

  it('ACCOUNT: solo la cuenta que aceptó la invitación de ese paciente lo ve', async () => {
    const userId = id();
    const email = `paciente-${userId}@demo.test`;
    await owner(
      `INSERT INTO iam.user_account (id, email, display_name, status) VALUES ($1, $2, 'Paciente', 'ACTIVE')`,
      [userId, email],
    );
    await owner(
      `INSERT INTO iam.invitation (id, organization_id, email, role, patient_id, token_hash, expires_at,
                                   accepted_at, invited_by)
       VALUES ($1, $2, $3, 'PATIENT', $4, $5, now() + interval '7 days', now(), $6)`,
      [
        id(),
        careTeam.orgId,
        email,
        careTeam.patientId,
        Buffer.from(id()),
        careTeam.members.responsible.userId,
      ],
    );
    const account = (user: string): SecurityContext => ({
      orgId: careTeam.orgId,
      userId: user,
      role: 'ACCOUNT',
    });
    expect((await visible(account(userId), careTeam.patientId)).patient).toBe(1);
    expect((await visible(account(id()), careTeam.patientId)).patient).toBe(0);
  });
});
