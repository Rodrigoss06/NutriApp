import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  asId,
  AUDIT_PORT,
  ENCRYPTION_PORT,
  normalizeDocumentNumber,
  UNIT_OF_WORK,
  type AuditPort,
  type EncryptionPort,
  type OrganizationId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorCode, id, pool, withContext } from '../../../test/integration/support/database.js';
import { createTenant, type Tenant } from '../../../test/integration/support/fixtures.js';
import type { Db } from '../database/prisma.provider.js';
import { PlatformModule } from '../platform.module.js';

let moduleRef: TestingModule;
let audit: AuditPort;
let crypto: EncryptionPort;
let uow: UnitOfWork;
let a: Tenant;
let b: Tenant;

const professional = (t: Tenant): SecurityContext => ({
  organizationId: t.orgId as OrganizationId,
  userId: asId(t.memberUserId),
  role: 'PROFESSIONAL',
  patientId: null,
});

beforeAll(async () => {
  a = await createTenant('Auditoría A');
  b = await createTenant('Auditoría B');
  moduleRef = await Test.createTestingModule({ imports: [PlatformModule] }).compile();
  moduleRef.useLogger(false);
  await moduleRef.init();
  audit = moduleRef.get(AUDIT_PORT);
  crypto = moduleRef.get(ENCRYPTION_PORT);
  uow = moduleRef.get(UNIT_OF_WORK);
});

afterAll(async () => {
  await moduleRef.close();
});

const auditRows = async (resourceId: string) =>
  (
    await pool('owner').query<Record<string, unknown>>(
      `SELECT organization_id, actor_user_id, actor_role, support_grant_id, action, resource_type, patient_id,
              changed_fields, outcome
       FROM audit.audit_log WHERE resource_id = $1`,
      [resourceId],
    )
  ).rows;

describe('RN-B03 · auditoría de lecturas y exportaciones', () => {
  it('se escribe aunque la lectura corra en una transacción de solo lectura', async () => {
    const resourceId = id();
    await uow.query(professional(a), async () => {
      await audit.record(professional(a), {
        action: 'READ',
        resourceType: 'clinical.patient',
        resourceId: asId(resourceId),
        patientId: asId(a.patientId),
      });
    });

    expect(await auditRows(resourceId)).toEqual([
      {
        organization_id: a.orgId,
        actor_user_id: a.memberUserId,
        actor_role: 'PROFESSIONAL',
        support_grant_id: null,
        action: 'READ',
        resource_type: 'clinical.patient',
        patient_id: a.patientId,
        changed_fields: [],
        outcome: 'SUCCESS',
      },
    ]);
  });

  it('el soporte de la plataforma queda auditado con su permiso (RN-A09)', async () => {
    const resourceId = id();
    const grantId = id();
    await audit.record(
      { ...professional(a), role: 'PLATFORM_ADMIN', supportGrantId: asId(grantId) },
      { action: 'READ', resourceType: 'clinical.patient', resourceId: asId(resourceId) },
    );

    expect(await auditRows(resourceId)).toMatchObject([
      { actor_role: 'PLATFORM_ADMIN', support_grant_id: grantId },
    ]);
  });

  it('de un cambio guarda los nombres de los campos, nunca sus valores', async () => {
    const resourceId = id();
    await audit.record(professional(a), {
      action: 'UPDATE',
      resourceType: 'clinical.patient',
      resourceId: asId(resourceId),
      changedFields: ['phone_enc', 'email'],
    });

    expect(await auditRows(resourceId)).toMatchObject([{ changed_fields: ['phone_enc', 'email'] }]);
  });

  it('el paciente deja su auditoría pero no la lee', async () => {
    const resourceId = id();
    const patient: SecurityContext = {
      organizationId: a.orgId as OrganizationId,
      userId: asId(id()),
      role: 'PATIENT',
      patientId: asId(a.patientId),
    };
    await audit.record(patient, {
      action: 'EXPORT',
      resourceType: 'clinical.patient',
      resourceId: asId(resourceId),
    });

    expect(await auditRows(resourceId)).toHaveLength(1);
    await withContext(
      'user',
      { orgId: a.orgId, role: 'PATIENT', patientId: a.patientId },
      async (client) => {
        expect((await client.query('SELECT 1 FROM audit.audit_log')).rows).toHaveLength(0);
      },
    );
  });

  it('falla cerrado: si no se puede escribir, record falla y quien lee no recibe los datos', async () => {
    const read = uow.query(professional(a), async () => {
      await audit.record(professional(a), {
        action: 'READ',
        resourceType: 'clinical.patient',
        resourceId: 'no-es-un-uuid' as never,
      });
      return 'datos clínicos';
    });

    await expect(read).rejects.toThrow();
  });
});

describe('RN-B06 · documento cifrado con índice ciego por organización', () => {
  const store = (t: Tenant, patientId: string, document: string) => {
    const org = t.orgId as OrganizationId;
    const normalized = normalizeDocumentNumber(document);
    return withContext(
      'user',
      { orgId: t.orgId, userId: t.memberUserId, role: 'PROFESSIONAL' },
      (client) =>
        errorCode(
          client,
          `UPDATE clinical.patient SET document_type = 'DNI', document_number_enc = $1, document_number_bidx = $2
         WHERE id = $3`,
          [
            Buffer.from(crypto.encrypt(normalized, `${org}:clinical.patient.document_number`)),
            Buffer.from(crypto.blindIndex(org, 'DNI', normalized)),
            patientId,
          ],
        ),
      { commit: true },
    );
  };

  it('se busca por igualdad sin descifrar, y el mismo documento en otra organización no choca', async () => {
    expect(await store(a, a.patientId, '45 678 912')).toBeUndefined();
    expect(await store(b, b.patientId, '45678912')).toBeUndefined();

    const org = a.orgId as OrganizationId;
    const found = await uow.query(professional(a), () =>
      moduleRef.get<Db>(TransactionHost).tx.patient.findMany({
        where: {
          documentNumberBidx: Buffer.from(
            crypto.blindIndex(org, 'DNI', normalizeDocumentNumber('45678912')),
          ),
        },
        select: { id: true, documentNumberEnc: true },
      }),
    );

    expect(found.map((p) => p.id)).toEqual([a.patientId]);
    const [{ documentNumberEnc } = { documentNumberEnc: null }] = found;
    expect(documentNumberEnc).not.toBeNull();
    expect(
      crypto.decrypt(
        documentNumberEnc ?? new Uint8Array(),
        `${org}:clinical.patient.document_number`,
      ),
    ).toBe('45678912');
  });

  it('el mismo documento dos veces en una organización viola el índice único', async () => {
    expect(await store(a, a.otherPatientId, '45678912')).toBe('23505');
  });

  it('en la base solo hay bytes cifrados', async () => {
    const { rows } = await pool('owner').query<{ enc: Buffer }>(
      'SELECT document_number_enc AS enc FROM clinical.patient WHERE id = $1',
      [a.patientId],
    );
    expect(rows[0]?.enc.includes(Buffer.from('45678912'))).toBe(false);
  });
});
