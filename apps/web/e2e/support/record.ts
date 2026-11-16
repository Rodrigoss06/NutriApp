import type { Locator, Page } from '@playwright/test';

/**
 * La barra lateral del expediente (ADR-138). En pantallas de menos de 1280 px (el celular) es un selector: lo abre antes de
 * devolverla, así sus enlaces se ven.
 */
export async function recordNavigation(page: Page): Promise<Locator> {
  const navigation = page.getByRole('navigation', { name: 'Secciones del expediente' });
  await navigation.waitFor();
  const toggle = navigation.getByRole('button', { name: /^Sección:/ });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  return navigation;
}

/** Abre una sección del expediente por su nombre, en escritorio y en el celular. */
export async function recordTab(page: Page, name: string): Promise<void> {
  await (await recordNavigation(page)).getByRole('link', { name, exact: true }).click();
}
