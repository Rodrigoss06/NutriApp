import { expect, test, type Locator, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  acceptByApi,
  apiAs,
  createOrganization,
  grantInPersonByApi,
  inviteByApi,
  loginInPage,
  registerPatientByApi,
  uniqueEmail,
} from './support/stack';

/**
 * P12 (PR 4) de punta a punta (RF-41, RN-F15, 07 §2 a §4) en escritorio y en el celular (WebKit): las tres llaves, el perfil,
 * el cribado con la revisión del coach, la postura con su dolor, las pruebas físicas por momento y la evidencia con su
 * consentimiento. axe en cada pantalla nueva.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Responde el cribado: No a todo, salvo la pregunta `yes` (la primera es crítica; la quinta, de revisión). */
async function answerScreening(page: Page, yes: number | null) {
  const form = page.getByRole('form', { name: 'Registrar un cribado' });
  const questions = form.getByRole('group');
  await expect(questions).toHaveCount(8);
  for (let index = 0; index < 8; index += 1) {
    await questions
      .nth(index)
      .getByRole('radio', { name: index === yes ? 'Sí' : 'No', exact: true })
      .check();
  }
  await form.getByRole('button', { name: 'Registrar cribado' }).click();
}

async function closeEvaluation(page: Page) {
  await page.getByRole('button', { name: 'Cerrar evaluación' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar evaluación' }).click();
  await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
}

const testRow = (page: Page, name: string) => page.locator('details', { hasText: name });

test.describe('P12 · Seguridad antes de prescribir', () => {
  test('RN-F15: el perfil, el cribado revisado y la postura sin dolor abren las llaves', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patient = await registerPatientByApi(organization.ownerEmail);
    await grantInPersonByApi(organization.ownerEmail, patient.id, 'HEALTH_DATA');
    await loginInPage(page, organization.ownerEmail);
    const base = `/panel/pacientes/${patient.id}/entrenamiento`;

    // Sin perfil, el alta cuenta como pendiente.
    await page.goto(base);
    await expect(page.getByText('BLOQUEADO · ALTA PENDIENTE')).toBeVisible();
    await expect(page.getByText('Sin evaluación postural cerrada')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // El perfil no se guarda sin lo que controla la propuesta.
    await page.goto(`${base}/perfil`);
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(page.getByText('Elige el objetivo.')).toBeVisible();
    await expect(page.getByText('Revisa los datos marcados')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await choose(page, page, 'Objetivo', 'Hipertrofia');
    await choose(page, page, 'Nivel', 'Principiante');
    await choose(page, page, 'Días por semana', '4');
    await choose(page, page, 'Alta médica', 'Apto');
    await page.getByRole('checkbox', { name: 'Gimnasio completo' }).check();
    await page.getByRole('textbox', { name: 'Caminata de 6 minutos (m)' }).fill('500');
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(page.getByText('Perfil guardado: revisión 1')).toBeVisible();

    // Falta el cribado: sin él, sigue bloqueado.
    await page.goto(base);
    await expect(page.getByText('BLOQUEADO · CRIBADO SIN REVISAR')).toBeVisible();

    // Un cribado en rojo espera la decisión del coach.
    await page.goto(`${base}/cribado`);
    await expect(
      page.getByText('Una respuesta afirmativa no equivale por sí sola a un diagnóstico'),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Registrar cribado' }).click();
    await expect(page.getByText('Responde esta pregunta.').first()).toBeVisible();
    await answerScreening(page, 0);
    const review = page.getByRole('form', { name: 'Revisar este cribado' });
    await expect(review).toBeVisible();
    await expect(page.getByText('Rojo', { exact: true })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto(base);
    await expect(page.getByText('BLOQUEADO · CRIBADO SIN REVISAR')).toBeVisible();
    await expect(page.getByText('Rojo, sin revisar')).toBeVisible();

    await page.goto(`${base}/cribado`);
    await choose(page, review, 'Decisión', 'Iniciar');
    await review
      .getByRole('textbox', { name: 'Nota de la revisión' })
      .fill('Con aval de su médico.');
    await review.getByRole('button', { name: 'Guardar revisión' }).click();
    await expect(page.getByText('Revisión: Iniciar')).toBeVisible();
    await expect(review).toBeHidden();

    // Sin evaluación postural no se bloquea: se avisa.
    await page.goto(base);
    await expect(page.getByText('PENDIENTE DE APROBACIÓN')).toBeVisible();
    await expect(page.getByText('Sin evaluación postural cerrada')).toBeVisible();

    // El dolor bloquea desde el borrador, aunque falte un lado.
    await page.goto(`${base}/postura`);
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Nueva evaluación postural' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Evaluación postural' }),
    ).toBeVisible();
    await expect(page.getByText('No usar esta pantalla para diagnosticar lesiones')).toBeVisible();
    const plank = testRow(page, 'Plancha');
    await plank.locator('summary').click();
    await plank.getByRole('checkbox', { name: 'Dolor' }).check();
    await plank.getByRole('button', { name: 'Guardar prueba' }).click();
    await expect(plank.locator('summary')).toContainText('DERIVAR / REVISAR');
    expect(await seriousViolations(page)).toEqual([]);

    const evaluationUrl = page.url();
    await page.goto(base);
    await expect(page.getByText('BLOQUEADO · REVISAR DOLOR')).toBeVisible();
    await expect(page.getByText('1 prueba con dolor')).toBeVisible();

    // Corregida y cerrada, la llave se abre y el aviso se va.
    await page.goto(evaluationUrl);
    await plank.locator('summary').click();
    await plank.getByRole('checkbox', { name: 'Dolor' }).uncheck();
    await choose(page, plank, 'Derecha', '2 · Adecuado');
    await choose(page, plank, 'Izquierda', '1 · Compensación leve');
    await plank.getByRole('button', { name: 'Guardar prueba' }).click();
    await expect(plank.locator('summary')).toContainText('PRECAUCIÓN');
    await closeEvaluation(page);
    await expect(page.getByRole('button', { name: 'Guardar prueba' })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(base);
    await expect(page.getByText('PENDIENTE DE APROBACIÓN')).toBeVisible();
    await expect(page.getByText('Sin evaluación postural cerrada')).toHaveCount(0);

    // En la línea de tiempo dice qué es.
    await page.goto(`/panel/pacientes/${patient.id}/linea-de-tiempo`);
    await expect(page.getByText('Evaluación postural')).toBeVisible();
  });

  test('07 §4: las pruebas físicas por momento, su evidencia con consentimiento y su enmienda', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patient = await registerPatientByApi(organization.ownerEmail);
    await grantInPersonByApi(organization.ownerEmail, patient.id, 'HEALTH_DATA');
    await loginInPage(page, organization.ownerEmail);
    const base = `/panel/pacientes/${patient.id}/entrenamiento/pruebas`;

    await page.goto(base);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Pruebas físicas', exact: true }),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Nueva evaluación de pruebas físicas' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: /Pruebas físicas · Inicial/ }),
    ).toBeVisible();
    const walk = testRow(page, 'Caminata de 6 minutos');
    await walk.locator('summary').click();
    await walk.getByRole('textbox', { name: 'Valor (m)' }).fill('1,234');
    await walk.getByRole('button', { name: 'Guardar prueba' }).click();
    await expect(
      walk.getByText('Usa un número de 0 en adelante, con hasta 2 decimales.'),
    ).toBeVisible();

    await walk.getByRole('textbox', { name: 'Valor (m)' }).fill('480,5');
    await walk.getByRole('button', { name: 'Guardar prueba' }).click();
    await expect(walk.locator('summary')).toContainText('480.5 m');
    expect(await seriousViolations(page)).toEqual([]);

    // La evidencia exige el consentimiento de imágenes, también si es un enlace.
    const file = walk.getByLabel('Archivo de evidencia');
    await file.setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: PNG });
    await expect(walk.getByText(/Sin el consentimiento de imágenes vigente/)).toBeVisible();

    await grantInPersonByApi(organization.ownerEmail, patient.id, 'IMAGES');
    await file.setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: PNG });
    const download = walk.getByRole('link', {
      name: 'Descargar evidencia de Caminata de 6 minutos',
    });
    await expect(download).toBeVisible();

    await walk.getByRole('button', { name: 'Quitar archivo' }).click();
    await expect(download).toHaveCount(0);

    await closeEvaluation(page);
    const evaluationUrl = page.url();

    await page.goto(base);
    await expect(
      page.getByRole('row', { name: /Caminata de 6 minutos/ }).getByText('BASE REGISTRADA'),
    ).toBeVisible();

    // Cerrada, solo se enmienda con su motivo.
    await page.goto(evaluationUrl);
    await page.getByRole('button', { name: 'Enmendar' }).click();
    await expect(page.getByText('Escribe el motivo.')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('textbox', { name: 'Motivo de la enmienda' }).fill('Se midió mal.');
    await page.getByRole('button', { name: 'Enmendar' }).click();
    await expect(page.getByText('Revisión 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Se midió mal.')).toBeVisible();
    await expect(testRow(page, 'Caminata de 6 minutos').locator('summary')).toContainText(
      '480.5 m',
    );
  });

  test('RN-A05: con acceso de lectura se ven las llaves y las pruebas, sin formularios', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patient = await registerPatientByApi(organization.ownerEmail);
    await grantInPersonByApi(organization.ownerEmail, patient.id, 'HEALTH_DATA');
    const reader = uniqueEmail();
    await acceptByApi(await inviteByApi(organization.ownerEmail, reader), 'Persona de lectura');
    const owner = await apiAs(organization.ownerEmail);
    const listed = await owner.get('/api/v1/organization/members');
    const { members } = (await listed.json()) as { members: { id: string; email: string }[] };
    const memberId = members.find((member) => member.email === reader)?.id ?? '';
    const joined = await owner.put(`/api/v1/patients/${patient.id}/care-team/${memberId}`, {
      data: { role: 'COLLABORATOR', access: 'READ' },
    });
    expect(joined.status(), 'sumar al equipo').toBe(204);
    await owner.dispose();

    await loginInPage(page, reader);
    const base = `/panel/pacientes/${patient.id}/entrenamiento`;

    await page.goto(base);
    await expect(page.getByText('BLOQUEADO · ALTA PENDIENTE')).toBeVisible();

    await page.goto(`${base}/perfil`);
    await expect(
      page.getByText(
        'Para editar el perfil, necesitas estar en su equipo de atención con acceso de escritura',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar perfil' })).toHaveCount(0);

    await page.goto(`${base}/cribado`);
    await expect(page.getByRole('form', { name: 'Registrar un cribado' })).toHaveCount(0);
    await expect(page.getByText(/Para registrar un cribado, necesitas/)).toBeVisible();

    await page.goto(`${base}/postura`);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Evaluación postural' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva evaluación postural' })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });
});
