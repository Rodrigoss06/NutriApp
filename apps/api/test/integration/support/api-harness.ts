import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../../src/app.module.js';
import { configureHttp, MAILER, type MailMessage } from '../../../src/platform/index.js';
import { id, pool } from './database.js';

/**
 * Arnés de pruebas de API sobre la aplicación completa contra PostgreSQL como app_user. Las organizaciones y su
 * personal se crean directo en la base (el flujo de invitación ya lo prueba P5) y se entra por HTTP.
 */
export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'un-cielo-gris-sobre-lima';

export type StaffKey = 'owner' | 'admin' | 'responsible' | 'team' | 'outsider';
const ROLES: Record<StaffKey, 'OWNER' | 'ADMIN' | 'PROFESSIONAL'> = {
  owner: 'OWNER',
  admin: 'ADMIN',
  responsible: 'PROFESSIONAL',
  team: 'PROFESSIONAL',
  outsider: 'PROFESSIONAL',
};

export interface StaffMember {
  readonly userId: string;
  readonly memberId: string;
  readonly email: string;
  cookie: string;
}

export interface StaffOrganization {
  readonly organizationId: string;
  readonly staff: Record<StaffKey, StaffMember>;
}

export class ApiHarness {
  app!: INestApplication<App>;
  readonly sent: MailMessage[] = [];
  #passwordHash: Promise<string> | null = null;

  async start(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue({ send: (message: MailMessage) => Promise.resolve(void this.sent.push(message)) })
      .compile();
    this.app = moduleRef.createNestApplication({ logger: false });
    configureHttp(this.app);
    await this.app.init();
  }

  stop(): Promise<void> {
    return this.app.close();
  }

  #with(req: request.Test, cookie?: string): request.Test {
    return cookie ? req.set('Cookie', cookie) : req;
  }

  get(path: string, cookie?: string): request.Test {
    return this.#with(request(this.app.getHttpServer()).get(`/api/v1${path}`), cookie);
  }

  post(path: string, body: object | undefined, cookie?: string): request.Test {
    const req = request(this.app.getHttpServer()).post(`/api/v1${path}`).set('Origin', ORIGIN);
    return this.#with(body === undefined ? req : req.send(body), cookie);
  }

  patch(path: string, body: object, cookie?: string): request.Test {
    return this.#with(
      request(this.app.getHttpServer()).patch(`/api/v1${path}`).set('Origin', ORIGIN).send(body),
      cookie,
    );
  }

  put(path: string, body: object, cookie?: string): request.Test {
    return this.#with(
      request(this.app.getHttpServer()).put(`/api/v1${path}`).set('Origin', ORIGIN).send(body),
      cookie,
    );
  }

  delete(path: string, cookie?: string): request.Test {
    return this.#with(
      request(this.app.getHttpServer()).delete(`/api/v1${path}`).set('Origin', ORIGIN),
      cookie,
    );
  }

  /** Organización activa con su suscripción y cinco miembros: dueño, administrador y tres profesionales. */
  async createStaffOrganization(
    options: { maxActivePatients?: number; visibility?: 'CARE_TEAM' | 'ORGANIZATION' } = {},
  ): Promise<StaffOrganization> {
    const owner = (sql: string, params: unknown[]) => pool('owner').query(sql, params);
    this.#passwordHash ??= hash(PASSWORD);
    const passwordHash = await this.#passwordHash;
    const organizationId = id();
    const planId = id();
    await owner(
      `INSERT INTO tenancy.subscription_plan (id, code, name, max_active_patients, max_professionals, price_cents)
       VALUES ($1, $2, 'Plan de prueba', $3, 10, 0)`,
      [planId, `PRUEBA_${planId.slice(-12).toUpperCase()}`, options.maxActivePatients ?? 50],
    );
    await owner(
      `INSERT INTO tenancy.organization (id, name, slug, patient_visibility) VALUES ($1, 'Consultorio', $2, $3)`,
      [organizationId, `org-${organizationId}`, options.visibility ?? 'CARE_TEAM'],
    );
    await owner(
      `INSERT INTO tenancy.subscription (id, organization_id, plan_id, status, starts_on, ends_on, price_cents,
                                         currency, max_active_patients, max_professionals, changed_by)
       SELECT $1, $2, p.id, 'ACTIVE', current_date - 1, current_date + 365, 0, 'PEN', p.max_active_patients,
              p.max_professionals, $2
       FROM tenancy.subscription_plan p WHERE p.id = $3`,
      [id(), organizationId, planId],
    );
    const staff = {} as Record<StaffKey, StaffMember>;
    for (const [key, role] of Object.entries(ROLES) as [StaffKey, string][]) {
      const member: StaffMember = {
        userId: id(),
        memberId: id(),
        email: `${key}-${id()}@demo.test`,
        cookie: '',
      };
      await owner(
        `INSERT INTO iam.user_account (id, email, password_hash, display_name, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
        [member.userId, member.email, passwordHash, `Persona ${key}`],
      );
      await owner(
        `INSERT INTO tenancy.member (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)`,
        [member.memberId, organizationId, member.userId, role],
      );
      const login = await this.post('/auth/login', { email: member.email, password: PASSWORD });
      const raw = login.headers['set-cookie'] as unknown as string[] | undefined;
      member.cookie = raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
      staff[key] = member;
    }
    return { organizationId, staff };
  }
}
