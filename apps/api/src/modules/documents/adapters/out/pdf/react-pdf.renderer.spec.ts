import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SheetRender } from '../../../application/ports/documents.ports.js';
import {
  DEMO_BRAND,
  LUIS_COMPOSITION_SHEET,
  LUIS_EXCHANGE_SHEET,
  LUIS_MENU_SHEET,
  LUIS_RESULTS_SHEET,
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

  it('el menú y los resultados también dan los mismos bytes', SLOW, async () => {
    for (const content of [LUIS_MENU_SHEET, LUIS_RESULTS_SHEET]) {
      const input = { ...INPUT, content };
      expect(sha256(await renderer.render(input))).toBe(sha256(await renderer.render(input)));
    }
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

describe('RN-H01 · RN-E16 · la ficha del menú', () => {
  it(
    'el menú de Luis: cada día con su opción A y B, el promedio y la receta con una porción',
    SLOW,
    async () => {
      const text = await pdfText(await renderer.render({ ...INPUT, content: LUIS_MENU_SHEET }));
      for (const expected of [
        'Menú semanal',
        'Promedio de la semana',
        'Lunes',
        'Domingo',
        'Opción A',
        'Arroz con pollo · 1 porción',
        'Opción B',
        'Pollo, carne pulpa · 120 g',
        // Con la opción A y la fibra que la TPCA no trae del pollo (RN-I03).
        'Total del día con la opción A: 204 kcal',
        'fibra al menos 1 g · falta en 1 de 2 alimentos',
        '0 de 7 días en rango',
        'Arroz con pollo · rinde 2 porciones',
        'Composición de receta, una porción',
        'Mifflin-St Jeor (1990)',
      ]) {
        expect(text).toContain(expected);
      }
    },
  );

  it('la composición se imprime con la misma plantilla, como un plan de un día', SLOW, async () => {
    const text = await pdfText(
      await renderer.render({ ...INPUT, content: LUIS_COMPOSITION_SHEET }),
    );
    expect(text).toContain('Dieta por composición');
    expect(text).toContain('Alimentos por tiempo');
    expect(text).toContain('Arroz pilado o pulido cocido · 200 g (1 taza)');
    expect(text).toContain('Total del día: 409 kcal');
    expect(text).not.toContain('Opción A');
    expect(text).not.toContain('Promedio de la semana');
  });
});

describe('RN-H04 · criterio 2 · la ficha de resultados muestra el método junto al % de grasa', () => {
  it(
    'cada número con su método, su interpretación con fuente y la bioimpedancia como lectura',
    SLOW,
    async () => {
      const text = await pdfText(await renderer.render({ ...INPUT, content: LUIS_RESULTS_SHEET }));
      for (const expected of [
        'Resultados antropométricos',
        'ISAK 2 · antropometría y bioimpedancia · medida el 13 de octubre de 2026',
        'En ayunas: sí',
        '% de grasa (Durnin & Womersley (1974) + Siri)',
        '20.3 %',
        'Promedio · ACE',
        'Método principal para % de grasa de este paciente.',
        'Masa ósea (Masa ósea (Rocha))',
        'Aviso: Rocha modifica la fórmula',
        'Sobrepeso · OMS 2008',
        'Cintura (mínima)',
        'Sin riesgo aumentado · OMS 2008',
        'Medidas consolidadas',
        'Pliegues',
        '12.0 mm',
        'Lectura del equipo Marca sintética BIA-1',
        'Ángulo de fase (Phase angle)',
        '6.8°',
      ]) {
        expect(text).toContain(expected);
      }
      // El IMC no repite su nombre como método.
      expect(text).not.toContain('IMC (IMC)');
    },
  );
});
