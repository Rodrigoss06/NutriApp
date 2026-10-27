import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { pngLogo } from './support/images';
import { luisWithPrescription } from './support/luis';
import { apiAs, createOrganization, loginInPage } from './support/stack';

/**
 * P11 (PR 4) · las fichas PDF desde el panel (RF-24, RN-H02, RN-H03, RN-H04) en escritorio y en el celular: la dieta
 * por intercambios de Luis, publicada, y sus resultados antropométricos se descargan como PDF con el logo de la marca.
 * La del plan la genera el worker al publicar; la de resultados, al pedirla («Generando…» hasta que está). Luis, su
 * plan y la marca se preparan por la API: sus pantallas tienen sus propias E2E. Datos sintéticos de seeds/luis.
 */

interface Draft {
  readonly id: string;
  readonly version: number;
  readonly meals: readonly {
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Readonly<Record<string, number>>;
  }[];
}

/** La marca de la organización con su logo, como la fija el dueño en «Marca de las fichas». */
async function brandByApi(api: APIRequestContext): Promise<void> {
  const saved = await api.put('/api/v1/organization/branding', {
    data: {
      displayName: 'Nutrición Fichas E2E',
      primaryColor: '#1d4ed8',
      secondaryColor: null,
      contact: { phone: '+51 999 000 444', email: 'fichas-e2e@demo.test', website: null },
      pdfFooter: 'Colegiatura CNP 0000',
    },
  });
  expect(saved.status(), 'guardar la marca').toBe(200);
  const logo = await api.put('/api/v1/organization/branding/logo', {
    multipart: { logo: { name: 'logo.png', mimeType: 'image/png', buffer: pngLogo(120, 40) } },
  });
  expect(logo.status(), 'subir el logo').toBe(200);
}

/** La dieta por intercambios de Luis con G-18 y un alimento permitido por grupo con intercambios, publicada. */
async function publishedPlanByApi(
  api: APIRequestContext,
  luisId: string,
  prescriptionId: string,
): Promise<string> {
  const { lists } = (await (await api.get('/api/v1/exchange-lists')).json()) as {
    lists: { id: string }[];
  };
  const created = await api.post(`/api/v1/patients/${luisId}/nutrition-plans`, {
    data: {
      modality: 'EXCHANGES',
      energyPrescriptionId: prescriptionId,
      exchangeListId: lists[0]?.id,
    },
  });
  expect(created.status(), 'crear el plan').toBe(201);
  const food = await api.post('/api/v1/foods', {
    data: {
      name: 'Comodín de las fichas',
      state: 'READY',
      nutrients: { ENERC_KCAL: 100, PROCNT: 10, FAT: 5, CHOCDF: 5 },
    },
  });
  expect(food.status(), 'crear el alimento propio').toBe(201);
  const { id: foodId } = (await food.json()) as { id: string };
  const save = async (plan: Draft, withFoods: boolean): Promise<Draft> => {
    const updated = await api.put(`/api/v1/nutrition-plans/${plan.id}`, {
      headers: { 'If-Match': `"${String(plan.version)}"` },
      data: {
        modality: 'EXCHANGES',
        fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
        overrides: {},
        splitOverrides: {},
        hydrationTargetMl: 2_500,
        instructions: 'Tomar agua durante el día.',
        meals: plan.meals.map(({ slotCode, name, timeOfDay, sharePct, servings }) => ({
          slotCode,
          name,
          timeOfDay,
          sharePct,
          allowedFoods: withFoods
            ? Object.entries(servings)
                .filter(([, count]) => count > 0)
                .map(([groupCode]) => ({ groupCode, foodId, grams: 50, householdText: null }))
            : [],
        })),
      },
    });
    expect(updated.status(), 'guardar el borrador').toBe(200);
    return (await updated.json()) as Draft;
  };
  // Primero el reparto de G-18; después, los alimentos de cada tiempo con intercambios (RN-G05).
  const ready = await save(await save((await created.json()) as Draft, false), true);
  const published = await api.post(`/api/v1/nutrition-plans/${ready.id}/publish`, {
    headers: { 'If-Match': `"${String(ready.version)}"` },
  });
  expect(published.status(), 'publicar el plan').toBe(200);
  return ready.id;
}

/** Pulsa «Descargar ficha (PDF)» y devuelve el archivo que guarda el navegador. */
async function downloadSheet(page: Page): Promise<{ name: string; pdf: Buffer }> {
  const button = page.getByRole('button', { name: 'Descargar ficha (PDF)' });
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return { name: download.suggestedFilename(), pdf: await readFile(await download.path()) };
}

test.describe('P11 · Fichas PDF', () => {
  test('RF-24 · la dieta publicada y los resultados de Luis se descargan como PDF, con el logo de la marca', async ({
    page,
  }) => {
    test.setTimeout(3 * 60_000);
    const organization = await createOrganization('Consultorio Fichas E2E');
    const api = await apiAs(organization.ownerEmail);
    await brandByApi(api);
    const luisId = await luisWithPrescription(organization.ownerEmail);
    const { prescriptions } = (await (
      await api.get(`/api/v1/patients/${luisId}/energy-prescriptions`)
    ).json()) as { prescriptions: { id: string; evaluationId: string }[] };
    const [prescription] = prescriptions;
    if (!prescription) throw new Error('Luis no tiene su prescripción energética.');
    const planId = await publishedPlanByApi(api, luisId, prescription.id);
    await loginInPage(page, organization.ownerEmail);

    await test.step('la dieta por intercambios publicada', async () => {
      await page.goto(`/panel/pacientes/${luisId}/dieta/${planId}`);
      await expect(
        page.getByRole('heading', { name: /Plan nutricional · versión 1/ }),
      ).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      const { name, pdf } = await downloadSheet(page);
      expect(name).toBe('ficha-dieta-por-intercambios.pdf');
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      // La única imagen de la ficha es el logo de la marca (RN-H03).
      expect(pdf.includes('/Subtype /Image')).toBe(true);
    });

    await test.step('los resultados antropométricos, que se generan al pedirlos', async () => {
      await page.goto(`/panel/pacientes/${luisId}/evaluaciones/${prescription.evaluationId}`);
      // El botón aparece cuando el worker terminó de calcular los resultados.
      await expect(page.getByRole('button', { name: 'Descargar ficha (PDF)' })).toBeVisible({
        timeout: 30_000,
      });
      expect(await seriousViolations(page)).toEqual([]);
      const { name, pdf } = await downloadSheet(page);
      expect(name).toBe('ficha-resultados-antropometricos.pdf');
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.includes('/Subtype /Image')).toBe(true);
    });

    await test.step('la API la entrega como application/pdf y como adjunto', async () => {
      const status = await api.get(
        `/api/v1/patients/${luisId}/documents/status?sourceType=NUTRITION_PLAN&sourceId=${planId}`,
      );
      const { document } = (await status.json()) as { document: { id: string } };
      const file = await api.get(`/api/v1/documents/${document.id}/file`);
      expect(file.headers()['content-type']).toBe('application/pdf');
      expect(file.headers()['content-disposition']).toBe(
        'attachment; filename="ficha-dieta-por-intercambios.pdf"',
      );
    });
    await api.dispose();
  });
});
