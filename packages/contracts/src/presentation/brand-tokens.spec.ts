import { describe, expect, it } from 'vitest';
import {
  brandCss,
  brandTokens,
  contrastRatio,
  DARKEST_SURFACE,
  DEFAULT_BRAND,
  parseBrand,
} from './brand-tokens.js';

const WHITE = '#ffffff';
/** El papel de las páginas (--background). */
const PAPER = '#f3f5f4';

describe('WCAG 1.4.3 y 1.4.11 · tokens de marca accesibles con cualquier color del cliente', () => {
  it('calcula el contraste WCAG: negro sobre blanco es 21:1 y un color consigo mismo 1:1', () => {
    expect(contrastRatio('#000000', WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio('#0f766e', '#0f766e')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', WHITE)).toBeCloseTo(4.54, 2);
  });

  it.each(['#0F766E', '#FFE600', '#1A1A2E', '#D97706', '#FFFFFF', '#000000', '#7C3AED', '#22C55E'])(
    'con %s: texto sobre el color ≥ 4.5, texto de marca sobre --muted, el papel y el blanco ≥ 4.5, borde y foco ≥ 3',
    (hex) => {
      const tokens = brandTokens(hex);

      expect(contrastRatio(tokens.foreground, tokens.base)).toBeGreaterThanOrEqual(4.5);
      for (const surface of [DARKEST_SURFACE, PAPER, WHITE]) {
        expect(contrastRatio(tokens.text, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.border, surface)).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('no cambia un color que ya cumple: un azul noche se usa tal cual como texto', () => {
    expect(brandTokens('#1A1A2E').text).toBe('#1a1a2e');
  });

  it('el primario provisional se oscurece un paso para leerse en el hover del botón secundario (--muted)', () => {
    expect(contrastRatio(DEFAULT_BRAND.primary, DARKEST_SURFACE)).toBeLessThan(4.5);
    expect(brandTokens(DEFAULT_BRAND.primary).text).toBe('#0f746c');
  });

  it('oscurece lo justo: el amarillo extremo se vuelve un texto legible y lleva texto negro encima', () => {
    const yellow = brandTokens('#FFE600');

    expect(yellow.foreground).toBe('#000000');
    expect(yellow.text).not.toBe('#ffe600');
    expect(contrastRatio(yellow.text, DARKEST_SURFACE)).toBeLessThan(4.8);
  });

  it('el ámbar provisional no sirve como texto sobre blanco; su variante oscurecida sí', () => {
    expect(contrastRatio(DEFAULT_BRAND.secondary, WHITE)).toBeLessThan(4.5);
    expect(contrastRatio(brandTokens(DEFAULT_BRAND.secondary).text, WHITE)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe('RN-H03 · la marca se valida y se escribe solo como variables --brand-*', () => {
  it('acepta colores #RRGGBB y rechaza cualquier otra cosa, que nunca llega al CSS', () => {
    expect(parseBrand({ primary: '#1a1a2e', secondary: '#FFE600' })).toEqual({
      primary: '#1a1a2e',
      secondary: '#ffe600',
    });
    expect(parseBrand({ primary: 'red' })).toEqual(DEFAULT_BRAND);
    expect(parseBrand({ primary: '#123;}body{display:none' })).toEqual(DEFAULT_BRAND);
    expect(parseBrand({ primary: '#7c3aed' })).toEqual({ ...DEFAULT_BRAND, primary: '#7c3aed' });
    expect(parseBrand(undefined)).toEqual(DEFAULT_BRAND);
  });

  it('el CSS solo declara variables --brand-* en :root', () => {
    const css = brandCss({ primary: '#1a1a2e', secondary: '#ffe600' });

    expect(css.startsWith(':root{')).toBe(true);
    const declarations = css.slice(':root{'.length, -1).split(';').filter(Boolean);
    expect(declarations.every((d) => /^--brand-[a-z-]+:#[0-9a-f]{6}$/.test(d))).toBe(true);
    expect(declarations).toHaveLength(8);
  });
});
