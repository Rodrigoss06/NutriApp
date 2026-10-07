import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brandVariables, contrastRatio, DEFAULT_BRAND } from './brand/brand-tokens';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const variable = (name: string): string => {
  const match = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`).exec(root);
  if (!match?.[1]) throw new Error(`Falta ${name} en :root`);
  return match[1];
};

describe('tokens de styles.css', () => {
  it('los valores de marca por defecto son exactamente brandTokens de la paleta provisional', () => {
    for (const [name, value] of Object.entries(brandVariables(DEFAULT_BRAND))) {
      expect({ name, value: variable(name) }).toEqual({ name, value });
    }
  });

  it('@theme inline solo referencia la marca con var(): nada fijo que impida cambiarla en ejecución', () => {
    const inline = css.slice(
      css.indexOf('@theme inline {'),
      css.indexOf('}', css.indexOf('@theme inline {')),
    );
    const brandLines = inline.split('\n').filter((line) => line.includes('--color-brand'));

    expect(brandLines).toHaveLength(8);
    expect(brandLines.every((line) => /var\(--brand-[a-z-]+\)/.test(line))).toBe(true);
    expect(inline).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it.each(['--success', '--warning', '--danger', '--info', '--muted-foreground'])(
    'WCAG 1.4.3 · %s se lee como texto sobre blanco y sobre su superficie (≥ 4.5)',
    (name) => {
      expect(contrastRatio(variable(name), variable('--background'))).toBeGreaterThanOrEqual(4.5);
      const surface = `${name}-surface`;
      if (root.includes(`${surface}:`)) {
        expect(contrastRatio(variable(name), variable(surface))).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('WCAG 1.4.11 · el borde de los campos tiene 3:1 sobre el fondo', () => {
    expect(
      contrastRatio(variable('--input-border'), variable('--background')),
    ).toBeGreaterThanOrEqual(3);
  });

  it('el verde de éxito no es el primario verde azulado', () => {
    expect(variable('--success')).not.toBe(variable('--brand-primary'));
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    expect(Math.abs(hue(variable('--success')) - hue(variable('--brand-primary')))).toBeGreaterThan(
      60,
    );
  });
});
