import { expect, test } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { DEMO_OWNER, DEMO_PASSWORD, loginInPage } from './support/stack';

test.describe('RNF-18 · axe sin violaciones graves', () => {
  for (const [name, query] of [
    ['paleta provisional', ''],
    ['marca extrema clara (#FFE600)', '?primary=FFE600&secondary=1A1A2E'],
    ['marca extrema oscura (#1A1A2E)', '?primary=1A1A2E&secondary=FFE600'],
  ] as const) {
    test(`catálogo con ${name}`, async ({ page }) => {
      await page.goto(`/admin/componentes${query}`);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Catálogo de componentes' }),
      ).toBeVisible();

      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  for (const path of ['/mi/hoy', '/mi/plan', '/panel', '/panel/pacientes']) {
    test(`pantalla ${path}`, async ({ page }) => {
      // El panel pide sesión (P5): se entra con la dueña de la organización demo de la semilla.
      if (path.startsWith('/panel')) await loginInPage(page, DEMO_OWNER, DEMO_PASSWORD);
      await page.goto(path);

      expect(await seriousViolations(page)).toEqual([]);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');
    });
  }
});

test.describe('RN-H03 · la marca cambia sin tocar componentes', () => {
  test('cambiar el primario recolorea el botón, la barra lateral del panel y la barra de la app', async ({
    page,
  }) => {
    await page.goto('/admin/componentes');
    const button = page.getByTestId('primary-button');
    const sidebar = page.getByTestId('sidebar-active');
    const bottom = page.getByTestId('bottom-active');
    const colors = async () => ({
      button: await button.evaluate((el) => getComputedStyle(el).backgroundColor),
      sidebar: await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor),
      bottom: await bottom.evaluate((el) => getComputedStyle(el).color),
    });

    expect(await colors()).toEqual({
      button: 'rgb(15, 118, 110)',
      sidebar: 'rgb(15, 118, 110)',
      bottom: 'rgb(15, 118, 110)',
    });

    await page.getByTestId('brand-primary').fill('#7c3aed');

    // El botón anima el cambio de color (transition-colors): se espera a que termine.
    await expect.poll(colors).toEqual({
      button: 'rgb(124, 58, 237)',
      sidebar: 'rgb(124, 58, 237)',
      bottom: 'rgb(124, 58, 237)',
    });
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('una marca extrema sigue legible: el amarillo lleva texto negro encima', async ({
    page,
  }) => {
    await page.goto('/admin/componentes?primary=FFE600');
    const button = page.getByTestId('primary-button');

    await expect(button).toHaveCSS('background-color', 'rgb(255, 230, 0)');
    await expect(button).toHaveCSS('color', 'rgb(0, 0, 0)');
  });
});

test.describe('app del paciente', () => {
  test('RN-G06 · la barra inferior tiene objetivos táctiles de 44 px o más y marca la sección activa', async ({
    page,
  }) => {
    await page.goto('/mi/hoy');
    const links = page.getByRole('navigation', { name: 'Secciones de la app' }).getByRole('link');

    await expect(links).toHaveText(['Hoy', 'Plan', 'Entreno', 'Progreso', 'Más']);
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(links.first()).toHaveAttribute('aria-current', 'page');
  });

  test('PWA · manifiesto con alcance /mi/ y service worker que no controla el panel', async ({
    page,
  }) => {
    await page.goto('/mi');
    await expect(page).toHaveURL(/\/mi\/hoy$/);

    const manifest: unknown = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({
      scope: '/mi/',
      start_url: '/mi/hoy',
      lang: 'es-PE',
      display: 'standalone',
    });
    expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe(
      '/manifest.webmanifest',
    );
    expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThan(0);

    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe('/mi/');
    await page.goto('/panel');
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  });
});
