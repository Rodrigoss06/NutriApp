import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { patientDocumentColumns } from './support/database';
import {
  acceptByApi,
  createOrganization,
  inviteByApi,
  linkFromMail,
  loginInPage,
  mailCount,
  PASSWORD,
  registerPatientByApi,
  setPatientLabel,
  uniqueEmail,
} from './support/stack';

/**
 * P6 de punta a punta (RF-05 a RF-10, RN-A05, RN-A06, RN-B01 a RN-B03) en escritorio y en el celular (WebKit): los 4
 * criterios de aceptación, el consentimiento en consulta y en papel, la historia clínica con su 409, el acceso del
 * paciente a la app y la auditoría del dueño. axe en cada pantalla nueva.
 */

const PDF = Buffer.from('%PDF-1.4\n% consentimiento firmado de prueba\n%%EOF\n');

async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** El menú del panel: en el celular está detrás del botón «Abrir menú». */
async function panelNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole('navigation', { name: 'Secciones del panel' });
}

async function staffMember(ownerEmail: string, name: string): Promise<string> {
  const email = uniqueEmail();
  await acceptByApi(await inviteByApi(ownerEmail, email), name);
  return email;
}

test.describe('P6 · criterios de aceptación', () => {
  test('alta con DNI cifrado, búsqueda exacta, READ en la auditoría y fuera del equipo no existe', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const responsible = await staffMember(organization.ownerEmail, 'Responsable E2E');
    const outsider = await staffMember(organization.ownerEmail, 'Ajena E2E');

    await loginInPage(page, responsible);
    await page.goto('/panel/pacientes/nuevo');
    await expect(page.getByRole('heading', { level: 1, name: 'Nuevo paciente' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Nombres').fill('Rosa');
    await page.getByLabel('Apellidos').fill('Quispe Mamani');
    await choose(page, 'Sexo', 'Femenino');
    await page.getByLabel('Fecha de nacimiento').fill('1990-04-12');
    await choose(page, 'Documento', 'DNI');
    await page.getByLabel('Número de documento').fill('4567 8912');
    await page.getByRole('button', { name: 'Registrar paciente' }).click();
    await page.waitForURL(/\/panel\/pacientes\/[0-9a-f-]{36}$/);
    const patientId = new URL(page.url()).pathname.split('/').at(-1) ?? '';

    // El documento se muestra con sus 4 últimos dígitos; el número completo no viaja.
    await expect(page.getByRole('heading', { level: 1, name: 'Rosa Quispe Mamani' })).toBeVisible();
    await expect(page.getByText('DNI ···· 8912').first()).toBeVisible();
    await expect(page.getByText('45678912')).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    // Criterio: buscar por DNI encuentra al paciente y la columna en la base no contiene el número en claro.
    await page.goto('/panel/pacientes');
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Nombre o documento', { exact: true }).fill('45678912');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Quispe Mamani, Rosa' })).toBeVisible();
    const columns = await patientDocumentColumns(patientId);
    expect(columns).not.toBeNull();
    for (const column of [columns?.enc, columns?.bidx]) {
      expect(column?.toString('latin1')).not.toContain('45678912');
      expect(column?.toString('hex')).not.toContain(Buffer.from('45678912').toString('hex'));
    }

    // Criterio: abrir el expediente deja un READ en la auditoría, que el dueño ve con quién y qué.
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await loginInPage(ownerPage, organization.ownerEmail);
    await ownerPage.goto(`/panel/auditoria?paciente=${patientId}`);
    await expect(ownerPage.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
    const read = ownerPage
      .getByRole('row')
      .filter({ hasText: 'Responsable E2E' })
      .filter({ hasText: 'Lectura' })
      .filter({ hasText: 'Ficha' });
    await expect(read.first()).toBeVisible();
    expect(await seriousViolations(ownerPage)).toEqual([]);

    // Criterio: con visibilidad por equipo, un profesional fuera del equipo no ve al paciente.
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    await loginInPage(outsiderPage, outsider);
    await outsiderPage.goto('/panel/pacientes?q=Quispe');
    await expect(outsiderPage.getByText('Sin resultados')).toBeVisible();
    await outsiderPage.goto(`/panel/pacientes/${patientId}`);
    await expect(outsiderPage.getByText('No encontramos a este paciente')).toBeVisible();
    await Promise.all([ownerContext.close(), outsiderContext.close()]);
  });

  test('historia clínica: sin consentimiento 422 con RN-B01; consentimiento en consulta y en papel; un 409 no borra lo escrito', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const patient = await registerPatientByApi(organization.ownerEmail, {
      firstName: 'Mario',
      lastName: 'Ccori Paz',
    });
    await loginInPage(page, organization.ownerEmail);

    // Criterio: sin consentimiento, guardar la historia clínica devuelve 422 con rule RN-B01.
    await page.goto(`/panel/pacientes/${patient.id}/historia`);
    await expect(page.getByRole('heading', { level: 2, name: 'Historia clínica' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Sueño').fill('Duerme 6 horas.');
    const [refused] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/clinical-history') && r.request().method() === 'PUT',
      ),
      page.getByRole('button', { name: 'Guardar historia clínica' }).click(),
    ]);
    expect(refused.status()).toBe(422);
    expect(await refused.json()).toMatchObject({ code: 'NC-CLI-002', rule: 'RN-B01' });
    await expect(page.getByText(/Sin el consentimiento de datos de salud vigente/)).toBeVisible();

    // Consentimiento en consulta, digital, y en papel con el escaneo (un PDF de prueba).
    await page.goto(`/panel/pacientes/${patient.id}/consentimientos`);
    expect(await seriousViolations(page)).toEqual([]);
    await choose(page, 'Consentimiento', 'Datos de salud');
    await expect(
      page.getByText('Texto provisional, pendiente de revisión legal').first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Registrar consentimiento' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Datos de salud' })).toContainText(
      'Vigente',
    );

    await choose(page, 'Consentimiento', 'Uso de la app');
    await choose(page, 'Cómo se otorga', 'En papel, escaneado');
    const scan = page.getByLabel('Escaneo firmado');
    // El navegador valida tipo y tamaño antes de subir.
    await scan.setInputFiles({
      name: 'firma.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('no es un PDF'),
    });
    await expect(page.getByText('La evidencia debe ser un PDF, JPG o PNG.')).toBeVisible();
    await scan.setInputFiles({
      name: 'grande.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]),
    });
    await expect(page.getByText(/pesa más de 5 MB/)).toBeVisible();
    await scan.setInputFiles({ name: 'firma.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.getByRole('button', { name: 'Registrar consentimiento' }).click();
    const paper = page.getByRole('listitem').filter({ hasText: 'Uso de la app' });
    await expect(paper).toContainText('En papel, escaneado');
    const evidence = paper.getByRole('link', { name: 'Descargar evidencia' });
    const download = await page.request.get((await evidence.getAttribute('href')) ?? '');
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toMatch(/^attachment;/);
    expect(await download.body()).toEqual(PDF);

    // Con HEALTH_DATA, la historia se guarda. Si otra persona guardó antes, lo escrito no se borra.
    await page.goto(`/panel/pacientes/${patient.id}/historia`);
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await loginInPage(other, organization.ownerEmail);
    await other.goto(`/panel/pacientes/${patient.id}/historia`);

    await page.getByLabel('Sueño').fill('Duerme 7 horas.');
    await page.getByRole('button', { name: 'Guardar historia clínica' }).click();
    await expect(page.getByText('Revisión 1 guardada')).toBeVisible();

    await other.getByLabel('Alcohol').fill('No bebe.');
    await other.getByRole('button', { name: 'Guardar historia clínica' }).click();
    await expect(other.getByText('Alguien guardó la historia mientras la editabas')).toBeVisible();
    await expect(other.getByLabel('Alcohol')).toHaveValue('No bebe.');
    await other.getByRole('button', { name: 'Cargar la versión actual' }).click();
    await expect(other.getByText('Versión actual: revisión 1')).toBeVisible();
    await expect(other.getByText('Duerme 7 horas.')).toBeVisible();
    await expect(other.getByLabel('Alcohol')).toHaveValue('No bebe.');
    await other.getByRole('button', { name: 'Guardar historia clínica' }).click();
    await expect(other.getByText('Revisión 2 guardada')).toBeVisible();
    await otherContext.close();

    // Condiciones, objetivos, notas y línea de tiempo: pantallas nuevas sin violaciones graves.
    await page.goto(`/panel/pacientes/${patient.id}/registros`);
    await page.getByLabel('Descripción').fill('Hipotiroidismo');
    await page.getByRole('button', { name: 'Registrar condición' }).click();
    await expect(page.getByText('Enfermedad: Hipotiroidismo')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto(`/panel/pacientes/${patient.id}/linea-de-tiempo`);
    await expect(page.getByRole('cell', { name: 'Enfermedad: Hipotiroidismo' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('RN-A06 · acceso del paciente a la app', () => {
  test('acepta con una casilla por finalidad, llega a /mi/hoy y al revocar APP_ACCESS su sesión responde 401', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const email = uniqueEmail();
    const patient = await registerPatientByApi(organization.ownerEmail, { email });

    await loginInPage(page, organization.ownerEmail);
    await page.goto(`/panel/pacientes/${patient.id}`);
    expect(await seriousViolations(page)).toEqual([]);
    const seen = await mailCount(email, '/invitacion');
    await page.getByRole('button', { name: 'Invitar a la app' }).click();
    await expect(page.getByRole('status').getByText('Invitación enviada')).toBeVisible();
    const link = await linkFromMail(email, '/invitacion', seen);

    const patientContext = await browser.newContext();
    const app = await patientContext.newPage();
    await app.goto(link);
    await expect(app.getByRole('heading', { name: /Tu acceso a la app de/ })).toBeVisible();
    const boxes = app.getByRole('checkbox');
    await expect(boxes).toHaveCount(2);
    for (const box of await boxes.all()) await expect(box).not.toBeChecked();
    await expect(
      app.getByText('Texto provisional, pendiente de revisión legal').first(),
    ).toBeVisible();
    expect(await seriousViolations(app)).toEqual([]);

    await app.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await app.getByRole('button', { name: 'Crear mi cuenta' }).click();
    await expect(app.getByRole('alert').getByText('Acepta cada finalidad')).toBeVisible();
    await app.getByLabel('Acepto: datos de salud').check();
    await app.getByLabel('Acepto: uso de la app').check();
    await app.getByRole('button', { name: 'Crear mi cuenta' }).click();
    await app.waitForURL(/\/mi\/hoy$/);
    await expect(app.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();

    // Revocar APP_ACCESS: la sesión del paciente deja de valer (401) y la app lo manda a entrar.
    await page.goto(`/panel/pacientes/${patient.id}/consentimientos`);
    const appAccess = page.getByRole('listitem').filter({ hasText: 'Uso de la app' });
    await appAccess.getByRole('button', { name: 'Revocar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revocar' }).click();
    await expect(appAccess).toContainText('Revocado');
    const account = await app.request.get('/api/v1/account');
    expect(account.status()).toBe(401);
    await app.reload();
    await app.waitForURL(/\/entrar/);
    await patientContext.close();
  });
});

test.describe('RF-06 · etiqueta de la organización y auditoría del dueño', () => {
  test('«Asesorados» en el panel; la auditoría es solo del dueño y con 90 días como máximo', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    await setPatientLabel(organization.ownerEmail, 'Asesorado');

    await loginInPage(page, organization.ownerEmail);
    await page.goto('/panel/pacientes');
    await expect(page.getByRole('heading', { level: 1, name: 'Asesorados' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nuevo asesorado' })).toBeVisible();
    const navigation = await panelNavigation(page);
    await expect(navigation.getByRole('link', { name: 'Asesorados' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Auditoría' })).toBeVisible();

    await page.goto('/panel/auditoria');
    const today = new Date();
    const from = new Date(today.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Desde').fill(from);
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByText('El rango es de 90 días como máximo.')).toBeVisible();

    const professional = await staffMember(organization.ownerEmail, 'Profesional E2E');
    const professionalContext = await browser.newContext();
    const professionalPage = await professionalContext.newPage();
    await loginInPage(professionalPage, professional);
    const professionalNavigation = await panelNavigation(professionalPage);
    await expect(professionalNavigation.getByRole('link', { name: 'Asesorados' })).toBeVisible();
    await expect(professionalNavigation.getByRole('link', { name: 'Auditoría' })).toHaveCount(0);
    await professionalPage.goto('/panel/auditoria');
    await expect(
      professionalPage.getByText('Solo el dueño de la organización ve la auditoría'),
    ).toBeVisible();
    await professionalContext.close();
  });
});
