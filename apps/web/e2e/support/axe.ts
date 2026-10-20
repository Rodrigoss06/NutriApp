import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Espera a que terminen las animaciones de entrada (ADR-051): a mitad de una, la opacidad parcial falsea el contraste.
 * Las infinitas (el fondo de curvas) no terminan nunca y no cambian el contenido: no se esperan.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== 'running' ||
            animation.effect?.getComputedTiming().iterations === Infinity,
        ),
    undefined,
    { timeout: 5_000 },
  );
}

/** Violaciones graves (RNF-18, WCAG 2.2 AA): las que bloquean. */
export async function seriousViolations(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));
}
