import { readFile } from 'node:fs/promises';
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
 * P12 (PR 6) de punta a punta (RF-26, RN-F12 a RN-F15) en escritorio y en el celular (WebKit): un programa a mano con un mesociclo de 4
 * semanas y 3 sesiones, duplicando la semana 1; la propuesta de 4 días, aprobada bloque a bloque y publicada; y lo que ve quien solo lee.
 */

const NO_ANSWERS = {
  S01: false,
  S02: false,
  S03: false,
  S04: false,
  S05: false,
  S06: false,
  S07: false,
  S08: false,
};

/** Perfil de hipertrofia, principiante, 4 días, con alta y cribado en verde: las llaves abiertas. */
async function openKeysByApi(ownerEmail: string, patientId: string) {
  const owner = await apiAs(ownerEmail);
  const profile = await owner.put(`/api/v1/patients/${patientId}/athlete-profile`, {
    data: {
      expectedRevision: 0,
      objective: 'HYPERTROPHY',
      level: 'BEGINNER',
      daysPerWeek: 4,
      equipmentCodes: ['FULL_GYM'],
      medicalClearance: 'CLEARED',
    },
  });
  expect(profile.status(), 'guardar el perfil').toBe(200);
  const screening = await owner.post(`/api/v1/patients/${patientId}/screenings`, {
    data: { answers: NO_ANSWERS },
  });
  expect(screening.status(), 'registrar el cribado').toBe(201);
  await owner.dispose();
}

/** Busca un ejercicio y lo elige en el recuadro de `scope`. */
async function pickExercise(scope: Locator, label: string, search: string, name: string) {
  await scope.getByRole('searchbox', { name: label }).fill(search);
  await scope.getByRole('button', { name: `Elegir ${name}`, exact: true }).click();
}

/** Un botón de la primera pantalla: si el clic llega antes de hidratar, se pierde y se repite. */
async function openManualForm(page: Page) {
  const button = page.getByRole('button', { name: 'Programa a mano' });
  const form = page.getByRole('form', { name: 'Nuevo programa a mano' });
  await expect(async () => {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await expect(form).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return form;
}

async function publish(page: Page) {
  await page.getByRole('button', { name: 'Publicar programa' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
}

test.describe('P12 · Programa de entrenamiento', () => {
  test('RF-26: un mesociclo de 4 semanas con 3 sesiones se arma, se duplica y se publica', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patient = await registerPatientByApi(organization.ownerEmail);
    await grantInPersonByApi(organization.ownerEmail, patient.id, 'HEALTH_DATA');
    await loginInPage(page, organization.ownerEmail);
    const base = `/panel/pacientes/${patient.id}/entrenamiento/programas`;

    // Con la llave cerrada no hay propuesta; a mano se puede, con aviso (RN-F15, ADR-070).
    await page.goto(base);
    await expect(page.getByText('BLOQUEADO · ALTA PENDIENTE')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar propuesta' })).toHaveCount(0);
    await expect(page.getByText('Todavía no hay programas')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    const form = await openManualForm(page);
    await expect(form.getByText('Una llave de seguridad sigue cerrada')).toBeVisible();
    await form.getByRole('button', { name: 'Crear programa' }).click();
    await expect(form.getByText('Escribe el nombre del programa.')).toBeVisible();
    await form.getByRole('textbox', { name: 'Nombre' }).fill('Fuerza base');
    await form.getByRole('button', { name: 'Crear programa' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Fuerza base' })).toBeVisible();
    await expect(page.getByText('Agrega al menos un mesociclo.')).toBeVisible();
    await expect(page.getByText('A mano se puede publicar, y queda registrado.')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Los datos del programa se corrigen en el borrador.
    await page.getByText('Editar los datos del programa').click();
    const data = page.getByRole('form', { name: 'Datos del programa' });
    await data.getByRole('textbox', { name: 'Nombre' }).fill('Fuerza de base');
    await data.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Fuerza de base' })).toBeVisible();
    await expect(data.getByText('Datos guardados.')).toBeVisible();

    // Un mesociclo de 4 semanas: el formulario ya lo sugiere.
    await page.getByRole('button', { name: 'Agregar mesociclo' }).click();
    await expect(page.getByRole('button', { name: /^Semana 4/ })).toBeVisible();
    await expect(page.getByText('La semana 1 no tiene sesiones.')).toBeVisible();

    // Otro sigue a continuación y se puede quitar.
    await page.getByRole('button', { name: 'Agregar mesociclo' }).click();
    await expect(page.getByRole('button', { name: /^Semana 8/ })).toBeVisible();
    await expect(page.getByText('Mesociclo 2 · semanas 5 a 8')).toBeVisible();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Mesociclo 2 · semanas 5 a 8' })
      .getByRole('button', { name: 'Quitar' })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Quitar mesociclo' }).click();
    await expect(page.getByRole('button', { name: /^Semana 8/ })).toHaveCount(0);

    // Tres sesiones con un ejercicio cada una, con los valores base.
    for (const position of [1, 2, 3]) {
      await page.getByRole('button', { name: 'Agregar sesión' }).click();
      const session = page.getByRole('region', { name: `Sesión ${String(position)}` });
      await pickExercise(
        session,
        `Agregar ejercicio a Sesión ${String(position)}`,
        'goblet',
        'Sentadilla goblet',
      );
      await expect(session.getByText('3 series · 8 a 12 rep · RIR 2 · 90 s')).toBeVisible();
    }
    await expect(page.getByText('Cambios sin guardar')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Semana 2/ })).toBeDisabled();
    expect(await seriousViolations(page)).toEqual([]);

    // Los ejercicios se reordenan y se quitan.
    const first = page.getByRole('region', { name: 'Sesión 1' });
    await pickExercise(first, 'Agregar ejercicio a Sesión 1', 'remo sentado', 'Remo sentado');
    await expect(first.getByText('2. Remo sentado')).toBeVisible();
    await first.getByRole('button', { name: 'Subir Remo sentado' }).click();
    await expect(first.getByText('1. Remo sentado')).toBeVisible();
    await expect(first.getByText('2. Sentadilla goblet')).toBeVisible();
    await first.getByRole('button', { name: 'Quitar Remo sentado' }).click();
    await expect(first.getByText('1. Sentadilla goblet')).toBeVisible();

    // Ajustar una serie: lo que la API no aceptaría se dice antes de guardar.
    await first.getByText('3 series · 8 a 12 rep · RIR 2 · 90 s').click();
    await first
      .getByRole('textbox', { name: 'Repeticiones mínimas, serie 3 de Sentadilla goblet' })
      .fill('ocho');
    await expect(
      page.getByText('Sesión 1, ejercicio 1, serie 3: revisa las repeticiones mínimas.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar semana 1' })).toBeDisabled();
    await first
      .getByRole('textbox', { name: 'Repeticiones mínimas, serie 3 de Sentadilla goblet' })
      .fill('6');
    await expect(first.getByText('3 series distintas')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Guardar semana 1' }).click();
    await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
    await expect(page.getByText(/Series de la semana por grupo muscular/)).toBeVisible();
    // El plan de la semana: las sesiones y los días de descanso (07 §8).
    const plan = page.getByRole('list', { name: 'Plan de la semana' });
    await expect(plan.getByRole('listitem')).toHaveCount(7);
    await expect(plan.getByRole('listitem').filter({ hasText: 'Día 3' })).toContainText('Sesión 3');
    await expect(plan.getByRole('listitem').filter({ hasText: 'Día 4' })).toContainText('Descanso');
    await expect(page.getByTitle(/FRACTIONAL_SETS/)).toBeVisible();

    // Duplicar: las semanas vacías ya están marcadas.
    await page.getByRole('button', { name: 'Duplicar en 3 semanas' }).click();
    await expect(page.getByText('Copiada a las semanas 2, 3 y 4.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Semana 4$/ })).toBeVisible();
    await expect(page.getByText('Para publicar falta:')).toHaveCount(0);

    // Descartar vuelve a lo guardado.
    await page
      .getByRole('region', { name: 'Sesión 3' })
      .getByRole('textbox', { name: 'Nombre de la sesión' })
      .fill('Otra');
    await expect(page.getByText('Cambios sin guardar')).toBeVisible();
    // Tocar la semana en la que se está no pierde lo escrito.
    await page.getByRole('button', { name: /^Semana 1$/ }).click();
    await expect(page.getByText('Cambios sin guardar')).toBeVisible();
    await page.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(page.getByRole('region', { name: 'Sesión 3' })).toBeVisible();
    await expect(page.getByText('Cambios sin guardar')).toHaveCount(0);

    // Reemplazar lo que ya tiene sesiones se confirma.
    await page.getByRole('checkbox', { name: 'Semana 2 (tiene 3 sesiones)' }).check();
    await page.getByRole('button', { name: 'Duplicar en 1 semana' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Lo que tienen ahora se pierde');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();

    await page.getByRole('button', { name: /^Semana 4$/ }).click();
    await expect(page.getByRole('region', { name: 'Sesión 3' })).toBeVisible();

    await publish(page);

    // Publicado se lee: con sus músculos y el método de las series, sin formularios.
    await expect(page.getByRole('button', { name: 'Agregar sesión' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Guardar semana/ })).toHaveCount(0);
    await expect(page.getByText(/Principales: /).first()).toBeVisible();
    await expect(page.getByTitle(/FRACTIONAL_SETS/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear versión nueva' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // La ficha de la rutina (RN-H01): la genera el worker al publicar; el nombre no lleva datos del paciente.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar ficha (PDF)' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('ficha-rutina.pdf');
    const pdf = await readFile(await download.path());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // La línea de tiempo y la lista lo muestran; una versión nueva es un borrador aparte (RN-F12).
    await page.getByRole('button', { name: 'Crear versión nueva' }).click();
    await expect(page.getByRole('heading', { name: 'Publicar la versión 2' })).toBeVisible();
    await page.goto(base);
    await expect(page.getByRole('row', { name: /Fuerza de base 1/ })).toContainText('Vigente');
    await expect(page.getByRole('row', { name: /Fuerza de base 2/ })).toContainText('Borrador');
    await page.goto(`/panel/pacientes/${patient.id}/linea-de-tiempo`);
    await expect(page.getByText(/Programa de entrenamiento/).first()).toBeVisible();
  });

  test('RN-F14: la propuesta de 4 días se aprueba o sustituye bloque a bloque y solo así se publica', async ({
    page,
  }) => {
    test.slow();
    const organization = await createOrganization();
    const patient = await registerPatientByApi(organization.ownerEmail);
    await grantInPersonByApi(organization.ownerEmail, patient.id, 'HEALTH_DATA');
    await openKeysByApi(organization.ownerEmail, patient.id);
    await loginInPage(page, organization.ownerEmail);

    await page.goto(`/panel/pacientes/${patient.id}/entrenamiento/programas`);
    const generate = page.getByRole('button', { name: 'Generar propuesta' });
    await expect(async () => {
      await generate.click({ timeout: 2_000 });
      await expect(page.getByText('0 de 32 aprobados')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    await expect(page.getByRole('heading', { level: 2, name: 'Hipertrofia' })).toBeVisible();
    await expect(page.getByText('Faltan 32 ejercicios por aprobar.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar programa' })).toBeDisabled();
    // Una propuesta no agrega ni quita mesociclos: salen del macrociclo.
    await expect(page.getByRole('form', { name: 'Agregar un mesociclo' })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    // El macrociclo trae la fase de cada semana con la versión de la tabla (RN-F13).
    await page.getByText('Macrociclo: 12 semanas').click();
    await expect(page.getByText(/Tabla de fases vigente desde/)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Sustituir: de su mismo patrón, con nota, y queda aprobado.
    const firstDay = page.getByRole('region', { name: 'Bloques del día 1' });
    await firstDay.getByRole('button', { name: /^Sustituir Sentadilla goblet/ }).click();
    const replacement = firstDay.getByRole('group', { name: 'Sustituir Sentadilla goblet' });
    await expect(
      replacement.getByRole('button', { name: 'Aprobar la sustitución' }),
    ).toBeDisabled();
    await pickExercise(replacement, 'Ejercicio que lo sustituye', 'prensa', 'Prensa de piernas');
    await replacement
      .getByRole('textbox', { name: 'Nota de la sustitución' })
      .fill('Prefiere máquina.');
    await expect(
      firstDay.getByText(/Semana 1: 2 series · 8 a 12 rep · RIR 3/).first(),
    ).toBeVisible();
    await replacement.getByRole('button', { name: 'Aprobar la sustitución' }).click();
    await expect(page.getByText('1 de 32 aprobados')).toBeVisible();
    await expect(firstDay.getByText('Sustituido')).toBeVisible();
    await expect(firstDay.getByText('Nota: Prefiere máquina.')).toBeVisible();

    // Los demás, uno por uno; el botón desaparece al aprobarlo.
    const pending = page.getByRole('button', { name: /^Aprobar .*, día \d, orden \d$/ });
    for (let approved = 1; approved < 32; approved += 1) {
      await pending.first().click();
      await expect(page.getByText(`${String(approved + 1)} de 32 aprobados`)).toBeVisible();
    }
    await expect(page.getByText('Faltan')).toHaveCount(0);

    await publish(page);
    await expect(page.getByRole('button', { name: /^Semana 12/ })).toBeVisible();
    await expect(page.getByText('Nota de la sustitución: Prefiere máquina.').first()).toBeVisible();
    await expect(page.getByText('Prensa de piernas').first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('RN-A05: con acceso de lectura se ve el programa, sin formularios', async ({ page }) => {
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
    const created = await owner.post(`/api/v1/patients/${patient.id}/training-programs`, {
      data: { name: 'Programa en borrador' },
    });
    expect(created.status(), 'crear el programa').toBe(201);
    const { id } = (await created.json()) as { id: string };
    await owner.dispose();

    await loginInPage(page, reader);
    const base = `/panel/pacientes/${patient.id}/entrenamiento/programas`;

    await page.goto(base);
    await expect(page.getByRole('link', { name: 'Programa en borrador' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Programa a mano' })).toHaveCount(0);
    await expect(page.getByText(/Para crear un programa, necesitas/)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(`${base}/${id}`);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Programa en borrador' }),
    ).toBeVisible();
    await expect(page.getByText(/Para editar este programa, necesitas/)).toBeVisible();
    await expect(page.getByRole('form', { name: 'Agregar un mesociclo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publicar programa' })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });
});
