import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SheetRender } from '../../../application/ports/documents.ports.js';
import {
  DEMO_BRAND,
  LUIS_EXCHANGE_SHEET,
} from '../../../application/sheets/sheet-fixtures.spec-support.js';
import { pdfText } from '../../../../../../test/support/pdf-text.js';
import { ReactPdfRenderer } from './react-pdf.renderer.js';

/** Un PNG de 1 × 1 píxel: el logo más chico posible. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const INPUT: SheetRender = {
  content: LUIS_EXCHANGE_SHEET,
  brand: DEMO_BRAND,
  logo: null,
  templateVersion: '1.0.0',
  issuedAt: new Date('2026-10-24T15:00:00.000Z'),
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const renderer = new ReactPdfRenderer();

/**
 * Cada ficha tarda unos 220 ms sola; con los paquetes probándose en paralelo y la cobertura, hasta 3 s. El plazo de la
 * prueba no mide nada: el p95 de RNF-04 se mide en la integración, con el worker y la base (documents.int.spec.ts).
 */
const SLOW = { timeout: 60_000 };

describe('RN-H02 · la misma ficha da el mismo PDF', () => {
  it('dos veces con la misma entrada: los mismos bytes, aunque el reloj avance', SLOW, async () => {
    const first = await renderer.render(INPUT);
    const second = await renderer.render(INPUT);
    expect(Buffer.from(first.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(sha256(second)).toBe(sha256(first));
  });

  it('otra marca o un logo dan otro PDF', SLOW, async () => {
    const base = sha256(await renderer.render(INPUT));
    const recolored = await renderer.render({
      ...INPUT,
      brand: { ...DEMO_BRAND, primaryColor: '#1d4ed8' },
    });
    const withLogo = await renderer.render({
      ...INPUT,
      brand: { ...DEMO_BRAND, logoFileId: 'logo' },
      logo: { content: PNG_1X1, mimeType: 'image/png' },
    });
    expect(sha256(recolored)).not.toBe(base);
    expect(sha256(withLogo)).not.toBe(base);
  });

  it('una plantilla que no existe no se inventa', async () => {
    await expect(renderer.render({ ...INPUT, templateVersion: '9.9.9' })).rejects.toThrow(
      'No existe la plantilla EXCHANGE_DIET 9.9.9.',
    );
  });
});

describe('RN-D02 · RN-H04 · cada número de la ficha con su método', () => {
  it(
    'la dieta por intercambios de Luis (G-17 a G-19) dice sus metas, sus métodos y su marca',
    SLOW,
    async () => {
      const text = await pdfText(await renderer.render(INPUT));
      for (const expected of [
        'Consultorio Demo',
        'Dieta por intercambios',
        'Versión 1 · vale desde el 24 de octubre de 2026',
        'Luis Demo',
        'P-000001',
        '28 años',
        // Metas (RN-E07) y de dónde salen (RN-E01, RN-E02).
        '1,835 kcal',
        'Mifflin-St Jeor (1990) 1,759 kcal',
        'PAL 1.40',
        'Gasto energético total (TMR × PAL + ejercicio)',
        'déficit de 770 kcal',
        'Reparto de macronutrientes',
        '2.0 g/kg',
        // Adecuación (RN-E10) con el rango de la organización.
        '% de adecuación (90.0–110.0 %)',
        '103.0 %',
        // Intercambios con su lista y versión (RN-E11) y el reparto por tiempos (RN-E09).
        'Intercambios (método clásico) con la lista Lista de demostración, versión 1.0 · provisional',
        'Carnes',
        'Reparto por tiempos de comida',
        'Desayuno · 07:00 · 25.0 % del día',
        'Huevo de gallina entero · 50 g (1 unidad mediana)',
        'Arroz pilado o pulido cocido · 90 g (½ taza)',
        // Agua (RN-E13), indicaciones y pie.
        'Meta de agua: 2,500 ml al día',
        'evita las bebidas azucaradas',
        '999 000 111 · hola@consultorio.example',
        'Atención con cita previa',
        'Página 1 de',
        'motor 1.3.0',
      ]) {
        expect(text).toContain(expected);
      }
    },
  );
});
