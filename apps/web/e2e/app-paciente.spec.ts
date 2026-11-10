import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import {
  appAccessByApi,
  patientRecordsByApi,
  publishedExchangePlanByApi,
  publishedProgramByApi,
} from './support/patient-app';
import {
  createOrganization,
  loginAsPatientInPage,
  loginInPage,
  patientWithAccess,
} from './support/stack';

/**
 * P13 de punta a punta, en escritorio y en el celular (RF-27 a RF-29; RN-G05, RN-G06, RN-G08, RN-G11, RN-G15, RN-G17). PR 3: Luis,
 * con su plan por intercambios publicado y su acceso a la app (preparados por la API), registra el desayuno de su plan en tres
 * toques desde Hoy, agua, una nota y su peso; su equipo cambia el tema y le deja un mensaje, que Hoy muestra. PR 4: con su programa
 * publicado, registra la sesión del día serie por serie y su registro diario en menos de 2 minutos, y Hoy muestra la indicación;
 * autoriza y retira el seguimiento del ciclo desde Más, y responde el cribado. axe en cada pantalla. Datos sintéticos.
 */

/** Hoy con las comidas del plan: el worker copia el plan publicado a la app (tracking.plans). */
async function hoyWithPlan(page: Page) {
  const breakfast = page.getByRole('button', { name: /^Desayuno/ });
  await expect(async () => {
    await page.goto('/mi/hoy');
    await expect(breakfast).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return breakfast;
}

test.describe('P13 · App del paciente: Hoy y el plan', () => {
  test('RN-G06: Luis registra el desayuno de su plan en tres toques desde Hoy', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await publishedExchangePlanByApi(organization.ownerEmail, patientId);
    const email = await appAccessByApi(organization.ownerEmail, patientId);

    await loginAsPatientInPage(page, email);
    const breakfast = await hoyWithPlan(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Tu día' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Tres toques: el tiempo de comida, un alimento permitido y Registrar con la porción del plan.
    await breakfast.click();
    const region = page.locator(`[id="${(await breakfast.getAttribute('aria-controls')) ?? ''}"]`);
    const food = region.locator('button[aria-pressed]').first();
    const foodName = ((await food.locator('span').first().textContent()) ?? '').trim();
    await food.click();
    await region.getByRole('button', { name: 'Registrar', exact: true }).click();

    await expect(region.getByRole('status').getByText('Registrado')).toBeVisible();
    const logged = page.getByRole('region', { name: 'Lo que registraste hoy' });
    await expect(logged.getByText(foodName)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Anular no borra: sale del día (RN-G12).
    await logged.getByRole('button', { name: `Anular ${foodName}` }).click();
    await expect(logged.getByText(foodName)).toHaveCount(0);
  });

  test('agua, una nota y el peso; el equipo cambia el tema y el mensaje, y Hoy los muestra', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await publishedExchangePlanByApi(organization.ownerEmail, patientId);
    const email = await appAccessByApi(organization.ownerEmail, patientId);

    await loginAsPatientInPage(page, email);
    await hoyWithPlan(page);
    const water = page.getByRole('region', { name: 'Agua' });
    await water.getByRole('button', { name: '+ 250 ml' }).click();
    await expect(water.getByRole('status').getByText('250 ml de agua.')).toBeVisible();

    // El agua refresca Hoy (router.refresh): ir a Más puede cruzarse con ese refresco, así que se reintenta.
    await expect(async () => {
      await page.goto('/mi/mas');
      await expect(page.getByLabel('Escribe a tu equipo')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByLabel('Escribe a tu equipo').fill('Hoy me costó la cena.');
    await page.getByRole('button', { name: 'Enviar nota' }).click();
    await expect(page.getByRole('status').getByText('Nota enviada')).toBeVisible();
    await page.getByLabel('Peso de hoy').fill('79.4');
    await page.getByRole('button', { name: 'Registrar peso' }).click();
    await expect(page.getByRole('status').getByText('Peso registrado')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    const staffContext = await browser.newContext();
    const panel = await staffContext.newPage();
    await loginInPage(panel, organization.ownerEmail);
    await panel.goto(`/panel/pacientes/${patientId}/app`);
    await expect(panel.getByRole('heading', { name: 'Ajustes de la app' })).toBeVisible();
    expect(await seriousViolations(panel)).toEqual([]);
    await panel.getByLabel('Color del tema').fill('#1f8a70');
    await panel.getByRole('button', { name: 'Guardar ajustes' }).click();
    await expect(panel.getByRole('status').getByText('Ajustes guardados')).toBeVisible();
    await panel.getByLabel('Mensaje nuevo').fill('Luis, vas muy bien.');
    await panel.getByRole('button', { name: 'Agregar mensaje' }).click();
    await expect(panel.getByText('Luis, vas muy bien.')).toBeVisible();
    await staffContext.close();

    await page.goto('/mi/hoy');
    await expect(page.getByText('Luis, vas muy bien.')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

/** El día de la semana en Lima: 0 es domingo. */
const limaWeekday = (): number =>
  new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())}T12:00:00Z`,
  ).getUTCDay();

test.describe('P14.5 · El check-in de la semana', () => {
  test('RN-G11 · P-21 · P-22: la alimentación, el peso y un comentario que su equipo recibe como nota; otra vez, lo corrige', async ({
    page,
    browser,
  }) => {
    // Solo abre del domingo al martes y la app no cambia la fecha: los demás días lo prueba la integración con un reloj fijo.
    test.skip(
      ![0, 1, 2].includes(limaWeekday()),
      'El check-in de la semana abre del domingo al martes.',
    );
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await publishedExchangePlanByApi(organization.ownerEmail, patientId);
    const email = await appAccessByApi(organization.ownerEmail, patientId);

    await loginAsPatientInPage(page, email);
    await hoyWithPlan(page);
    const card = page.getByRole('region', { name: 'Check-in de la semana' });
    await expect(card.getByText(/^Se completa hasta el martes/)).toBeVisible();
    await card.getByLabel('Cuánto de tu plan de alimentación cumpliste esta semana').fill('82');
    await card.getByLabel('Tu peso de hoy').fill('79.4');
    await card.getByLabel('Comentarios para tu equipo').fill('Semana con cenas tarde por trabajo.');
    await card.getByRole('button', { name: 'Enviar check-in' }).click();
    await expect(card.getByRole('status').getByText('Check-in enviado')).toBeVisible();
    await expect(card.getByText(/Tu alimentación de la semana: 82 %/)).toBeVisible();
    await expect(card.getByText(/Tu equipo recibió tu comentario/)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // RN-G12: corregirlo dentro del plazo.
    await card.getByRole('button', { name: 'Corregir' }).click();
    await card.getByLabel('Cuánto de tu plan de alimentación cumpliste esta semana').fill('85');
    await card.getByRole('button', { name: 'Enviar check-in' }).click();
    await expect(card.getByText(/Tu alimentación de la semana: 85 %/)).toBeVisible();

    // RN-G13: su equipo lee el comentario como una nota en Seguimiento.
    const staffContext = await browser.newContext();
    const panel = await staffContext.newPage();
    await loginInPage(panel, organization.ownerEmail);
    await panel.goto(`/panel/pacientes/${patientId}/seguimiento`);
    // Una sola nota: Seguimiento la muestra entre las nuevas y en el día.
    await expect(panel.getByText('Semana con cenas tarde por trabajo.').first()).toBeVisible();
    await staffContext.close();
  });
});

/** La sesión del día en Entreno: el worker copia el programa publicado a la app (tracking.programs). */
async function entrenoWithSession(page: Page) {
  const session = page.getByRole('region', { name: 'Sesión 1' });
  await expect(async () => {
    await page.goto('/mi/entreno');
    await expect(session).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return session;
}

test.describe('P13 · App del paciente: entreno, registro diario y ciclo', () => {
  test('RN-G11 · RN-G15: registra la sesión y su registro diario en menos de 2 minutos, y Hoy muestra la indicación', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patient = await patientWithAccess(organization.ownerEmail);
    await publishedProgramByApi(organization.ownerEmail, patient.id);
    await loginAsPatientInPage(page, patient.email);

    // RF-29: la sesión de hoy serie por serie, con el tonelaje a la vista (RN-F03).
    const session = await entrenoWithSession(page);
    await expect(session.getByText('de 1,440 kg prescritos')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    for (const set of [1, 2, 3]) {
      await session
        .getByRole('button', { name: `Hecha: Serie ${String(set)} de Sentadilla goblet` })
        .click();
    }
    await expect(session.getByText('Tonelaje: 1,440 kg')).toBeVisible();
    await session.getByLabel('Duración').fill('45');
    await session.getByLabel('RPE de la sesión').fill('7');
    await session.getByRole('button', { name: 'Registrar sesión' }).click();
    const logged = page.getByRole('region', { name: 'Lo que registraste hoy' });
    await expect(logged.getByText('1,440 kg')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Criterio de P13: el registro diario, desde Hoy, en menos de 2 minutos.
    const started = Date.now();
    await page.goto('/mi/hoy');
    const indication = page.getByRole('region', { name: 'Indicación del día' });
    await expect(indication.getByText('Sin datos suficientes')).toBeVisible();
    await indication.getByRole('link', { name: 'Hacer mi registro diario' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Registro diario' })).toBeVisible();
    // La duración y el RPE vienen de la sesión registrada.
    await expect(page.getByLabel('Duración')).toHaveValue('45');
    await page.getByLabel('Sueño de anoche').fill('8');
    for (const [scale, value] of [
      ['Fatiga', '2'],
      ['Dolor muscular', '2'],
      ['Estrés', '2'],
      ['Motivación', '4'],
    ] as const) {
      await page.getByRole('group', { name: scale }).getByText(value, { exact: true }).click();
    }
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Guardar registro' }).click();

    await page.waitForURL(/\/mi\/hoy$/);
    await expect(indication.getByText('Verde · mantener')).toBeVisible();
    await expect(
      indication.getByText('Entrena según lo planificado. Cumple la sesión planificada.'),
    ).toBeVisible();
    await expect(indication.getByText('100.0 %')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(120_000);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('RN-G17: autoriza el seguimiento del ciclo desde Más, el coach registra la anticoncepción y al retirarlo se deja de pedir', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const patient = await patientWithAccess(organization.ownerEmail);
    await publishedProgramByApi(organization.ownerEmail, patient.id);
    await loginAsPatientInPage(page, patient.email);
    const symptoms = page.getByRole('group', { name: 'Síntomas del ciclo' });

    await page.goto('/mi/registro');
    await expect(page.getByRole('heading', { level: 1, name: 'Registro diario' })).toBeVisible();
    await expect(symptoms).toHaveCount(0);

    await page.goto('/mi/mas');
    const cycle = page.getByRole('region', { name: 'Seguimiento del ciclo menstrual' });
    await expect(cycle.getByText('Texto provisional, pendiente de revisión legal.')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await cycle.getByRole('button', { name: 'Autorizar el seguimiento del ciclo' }).click();
    await expect(cycle.getByText('Lo autorizaste')).toBeVisible();

    // Autorizar refresca Más (router.refresh): ir al registro puede cruzarse con ese refresco, así que se reintenta.
    await expect(async () => {
      await page.goto('/mi/registro');
      await expect(symptoms).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // ADR-080: la anticoncepción hormonal la registra el coach, solo con la autorización vigente.
    const staffContext = await browser.newContext();
    const panel = await staffContext.newPage();
    await loginInPage(panel, organization.ownerEmail);
    await panel.goto(`/panel/pacientes/${patient.id}/entrenamiento/perfil`);
    await panel.getByRole('combobox', { name: 'Anticoncepción hormonal' }).click();
    await panel.getByRole('option', { name: 'Sí', exact: true }).click();
    await panel.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(panel.getByText('Perfil guardado: revisión 2')).toBeVisible();
    expect(await seriousViolations(panel)).toEqual([]);
    await staffContext.close();

    // Retirarla: el registro diario deja de pedir los síntomas (RN-B02: lo registrado se conserva).
    await page.goto('/mi/mas');
    await cycle.getByRole('button', { name: 'Retirar la autorización' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Retirar' }).click();
    await expect(
      cycle.getByRole('button', { name: 'Autorizar el seguimiento del ciclo' }),
    ).toBeVisible();
    await page.goto('/mi/registro');
    await expect(page.getByRole('heading', { level: 1, name: 'Registro diario' })).toBeVisible();
    await expect(symptoms).toHaveCount(0);
  });

  test('07 §3.2: responde el cribado de seguridad desde Más', async ({ page }) => {
    const organization = await createOrganization();
    const patient = await patientWithAccess(organization.ownerEmail);
    await loginAsPatientInPage(page, patient.email);

    await page.goto('/mi/mas');
    const screening = page.getByRole('region', { name: 'Cribado de seguridad' });
    await expect(screening.getByText('Antes de entrenar, tu coach necesita saber')).toBeVisible();
    const questions = screening.getByRole('group');
    await expect(questions).toHaveCount(8);
    for (const question of await questions.all()) {
      await question.getByText('No', { exact: true }).click();
    }
    expect(await seriousViolations(page)).toEqual([]);
    await screening.getByRole('button', { name: 'Enviar mis respuestas' }).click();
    await expect(screening.getByText('Ya respondiste el cribado')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('P13 · El equipo y los registros del paciente', () => {
  test('RN-G01 · RN-G02 · RN-G13: el equipo ve el día, excluye un registro con motivo y abre las notas nuevas', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patient = await patientWithAccess(organization.ownerEmail);
    await patientRecordsByApi(patient.email, [
      { path: '/me/hydration-logs', body: { volumeMl: 250 } },
      { path: '/me/hydration-logs', body: { volumeMl: 250 } },
      { path: '/me/notes', body: { body: 'Anoche me costó dormir.' } },
    ]);
    await loginInPage(page, organization.ownerEmail);

    // RN-G13: la nota aparece nueva; al abrirla queda leída.
    const read = page.waitForResponse(
      (response) => response.url().includes('/app-notes/read') && response.status() === 200,
    );
    await page.goto(`/panel/pacientes/${patient.id}/seguimiento`);
    const fresh = page.getByRole('region', { name: 'Notas nuevas del paciente' });
    await expect(fresh.getByText('Anoche me costó dormir.')).toBeVisible();
    await expect(fresh.getByText('Nueva', { exact: true })).toBeVisible();
    await read;
    expect(await seriousViolations(page)).toEqual([]);

    // RN-G02: excluir el agua repetida, con su motivo; el original se conserva.
    const water = page.getByRole('region', { name: 'Agua y peso' });
    const adjust = water.getByRole('button', { name: 'Ajustar: Agua, 250 ml' }).nth(1);
    await adjust.click();
    const form = page.locator(`[id="${(await adjust.getAttribute('aria-controls')) ?? ''}"]`);
    await form.getByText('Excluir', { exact: true }).click();
    await form.getByLabel('Motivo').fill('Lo registró dos veces por error.');
    await form.getByRole('button', { name: 'Guardar ajuste' }).click();
    await expect(water.getByText('Excluido')).toBeVisible();
    await expect(water.getByText('Lo registró dos veces por error.')).toBeVisible();
    const totals = page.getByRole('region', { name: 'Totales del día' });
    const waterRow = totals.getByRole('row', { name: /Agua \(ml\)/ });
    await expect(waterRow).toContainText('250');
    await expect(waterRow).toContainText('500');
    expect(await seriousViolations(page)).toEqual([]);

    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Notas nuevas del paciente' })).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Notas del día' }).getByText('Leída'),
    ).toBeVisible();
  });
});
