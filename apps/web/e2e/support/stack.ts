import { randomBytes } from 'node:crypto';
import { expect, request, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Soporte del E2E contra la pila real: web (build de producción), API, worker y Mailpit. Datos sintéticos: cada
 * prueba usa correos únicos e2e-<aleatorio>@demo.test. Los enlaces se leen del correo, como lo haría la persona:
 * no hay rutas de prueba que devuelvan tokens.
 */
export const APP_URL = process.env['E2E_APP_URL'] ?? 'http://localhost:3000';
export const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://127.0.0.1:8025';
export const PASSWORD = 'un-cielo-gris-sobre-lima';
/** Cuentas de la semilla local (pnpm db:seed con APP_ENV=local). */
export const DEMO_PASSWORD = process.env['E2E_DEMO_PASSWORD'] ?? 'Demostracion-Local-2026';
export const DEMO_OWNER = 'duena@demo.example.com';
export const DEMO_PLATFORM_ADMIN = 'plataforma@demo.example.com';

export const uniqueEmail = (): string => `e2e-${randomBytes(6).toString('hex')}@demo.test`;

/** Contexto de API con Origin = APP_URL: sin él, la API responde 403 a toda escritura (CSRF). */
export function apiContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL } });
}

export async function apiLogin(
  api: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const response = await api.post('/api/v1/auth/login', { data: { email, password } });
  expect(response.status(), `entrar como ${email}`).toBe(200);
}

interface MailpitSummary {
  readonly ID: string;
}

async function linksInMail(to: string, path: string): Promise<string[]> {
  const mail = await request.newContext({ baseURL: MAILPIT_URL });
  const pattern = new RegExp(`${path.replace('/', '\\/')}#[A-Za-z0-9_-]{43}`);
  const search = await mail.get('/api/v1/search', { params: { query: `to:"${to}"` } });
  const { messages } = (await search.json()) as { messages: MailpitSummary[] };
  const links: string[] = [];
  // Mailpit devuelve primero el más reciente.
  for (const message of messages) {
    const detail = await mail.get(`/api/v1/message/${message.ID}`);
    const { Text } = (await detail.json()) as { Text: string };
    const found = pattern.exec(Text)?.[0];
    if (found) links.push(found);
  }
  await mail.dispose();
  return links;
}

/** Cuántos enlaces de ese tipo recibió ya el correo: para esperar el siguiente. */
export async function mailCount(
  to: string,
  path: '/invitacion' | '/recuperar/nueva',
): Promise<number> {
  return (await linksInMail(to, path)).length;
}

/**
 * El enlace más reciente con token que llegó a ese correo, después de los `seen` que ya había. El worker envía
 * después de la petición: se espera con expect.poll.
 */
export async function linkFromMail(
  to: string,
  path: '/invitacion' | '/recuperar/nueva',
  seen = 0,
): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const links = await linksInMail(to, path);
        link = links[0] ?? '';
        return links.length > seen;
      },
      { message: `correo con ${path} para ${to}`, timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  return link;
}

/** El token del enlace (lo que va después de #). */
export const tokenOf = (link: string): string => link.slice(link.indexOf('#') + 1);

export interface TestOrganization {
  readonly id: string;
  readonly ownerEmail: string;
}

/** Organización nueva por la API de plataforma, con el PLATFORM_ADMIN de la semilla; el dueño acepta por API. */
export async function createOrganization(name = 'Consultorio E2E'): Promise<TestOrganization> {
  const platform = await apiContext();
  await apiLogin(platform, DEMO_PLATFORM_ADMIN, DEMO_PASSWORD);
  const ownerEmail = uniqueEmail();
  const created = await platform.post('/api/v1/platform/organizations', {
    data: {
      name,
      slug: `e2e-${randomBytes(5).toString('hex')}`,
      planCode: 'TRAMO_50',
      startsOn: new Date().toISOString().slice(0, 10),
      ownerEmail,
    },
  });
  expect(created.status(), 'crear la organización').toBe(201);
  const { id } = (await created.json()) as { id: string };
  await platform.dispose();
  await acceptByApi(await linkFromMail(ownerEmail, '/invitacion'), 'Dueña E2E');
  return { id, ownerEmail };
}

/** Acepta una invitación por la API (para preparar datos); los recorridos de la interfaz usan la página. */
export async function acceptByApi(link: string, displayName?: string): Promise<void> {
  const api = await apiContext();
  const accepted = await api.post('/api/v1/invitations/accept', {
    data: { token: tokenOf(link), password: PASSWORD, ...(displayName ? { displayName } : {}) },
  });
  expect(accepted.status(), 'aceptar la invitación').toBe(200);
  await api.dispose();
}

/** Invita por la API como dueño de la organización y devuelve el enlace del correo. */
export async function inviteByApi(
  ownerEmail: string,
  email: string,
  role: 'OWNER' | 'ADMIN' | 'PROFESSIONAL' = 'PROFESSIONAL',
): Promise<string> {
  const seen = await mailCount(email, '/invitacion');
  const owner = await apiContext();
  await apiLogin(owner, ownerEmail, PASSWORD);
  const invited = await owner.post('/api/v1/organization/invitations', { data: { email, role } });
  expect(invited.status(), 'invitar').toBe(201);
  await owner.dispose();
  return linkFromMail(email, '/invitacion', seen);
}

/** Entra por la interfaz. */
export async function loginInPage(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/panel/);
}
