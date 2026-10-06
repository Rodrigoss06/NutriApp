import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  asId,
  systemContext,
  UNIT_OF_WORK,
  type OrganizationId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseModule } from './database.module.js';
import type { Db } from './prisma.provider.js';
import { id } from '../../../test/integration/support/database.js';
import { createTenant, type Tenant } from '../../../test/integration/support/fixtures.js';

let moduleRef: TestingModule;
let uow: UnitOfWork;
let db: Db;
let a: Tenant;
let b: Tenant;

const professional = (t: Tenant): SecurityContext => ({
  organizationId: t.orgId as OrganizationId,
  userId: asId(t.memberUserId),
  role: 'PROFESSIONAL',
  patientId: null,
});

beforeAll(async () => {
  a = await createTenant('A');
  b = await createTenant('B');
  moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
  await moduleRef.init();
  uow = moduleRef.get(UNIT_OF_WORK);
  db = moduleRef.get(TransactionHost);
});

afterAll(async () => {
  await moduleRef.close();
});

const settings = () =>
  db.tx.$queryRaw<{ org: string; role: string; patient: string; ro: string }[]>`
    SELECT current_setting('app.org_id', true) AS org, current_setting('app.role', true) AS role,
           current_setting('app.patient_id', true) AS patient, current_setting('transaction_read_only') AS ro`;

describe('02 §6 · UnitOfWork: una transacción por comando con el contexto de seguridad', () => {
  it('fija app.org_id, app.user_id, app.role y app.patient_id dentro de la transacción', async () => {
    const [row] = await uow.run(professional(a), settings);

    expect(row).toEqual({ org: a.orgId, role: 'PROFESSIONAL', patient: '', ro: 'off' });
  });

  it('RN-A01 · la RLS lee ese contexto: el comando solo ve su organización', async () => {
    const orgs = await uow.run(professional(a), () =>
      db.tx.patient.findMany({ distinct: ['organizationId'], select: { organizationId: true } }),
    );

    expect(orgs).toEqual([{ organizationId: a.orgId }]);
  });

  it('el contexto no sobrevive a la transacción: la conexión vuelve limpia al pool', async () => {
    await uow.run(professional(a), settings);
    const [after] = await uow.run(systemContext(), settings);

    expect(after).toMatchObject({ org: '', role: 'SYSTEM' });
  });

  it('si el comando falla, nada de lo escrito queda', async () => {
    const goalId = id();
    await expect(
      uow.run(professional(a), async () => {
        await db.tx.goal.create({
          data: {
            id: goalId,
            organizationId: a.orgId,
            patientId: a.patientId,
            kind: 'HEALTH',
            createdBy: a.memberUserId,
          },
          select: { id: true },
        });
        throw new Error('falla del dominio');
      }),
    ).rejects.toThrow('falla del dominio');

    const found = await uow.query(professional(a), () =>
      db.tx.goal.findUnique({ where: { id: goalId } }),
    );
    expect(found).toBeNull();
  });

  it('las consultas corren en una transacción de solo lectura con el mismo contexto', async () => {
    const [row] = await uow.query(professional(b), settings);
    expect(row).toEqual({ org: b.orgId, role: 'PROFESSIONAL', patient: '', ro: 'on' });

    await expect(
      uow.query(professional(b), () =>
        db.tx.goal.createMany({
          data: [
            {
              id: id(),
              organizationId: b.orgId,
              patientId: b.patientId,
              kind: 'HEALTH',
              createdBy: b.memberUserId,
            },
          ],
        }),
      ),
    ).rejects.toThrow(/read-only/);
  });

  it('no se anidan: un comando abre una sola transacción', async () => {
    await expect(
      uow.run(professional(a), () => uow.run(professional(b), settings)),
    ).rejects.toThrow('UnitOfWork anidada');
  });
});
