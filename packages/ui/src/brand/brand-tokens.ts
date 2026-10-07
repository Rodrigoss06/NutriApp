import { z } from 'zod';

/** Paleta provisional hasta que el cliente entregue su identidad visual (P3, decisión 3). */
export const DEFAULT_BRAND = Object.freeze({ primary: '#0f766e', secondary: '#d97706' });

export interface Brand {
  readonly primary: string;
  readonly secondary: string;
}

/** Variantes accesibles de un color de marca. */
export interface BrandColorTokens {
  /** El color tal cual: fondos de botones, barras, acentos. */
  readonly base: string;
  /** Texto e íconos sobre `base`: blanco o negro, el de mayor contraste (≥ 4.5:1). */
  readonly foreground: string;
  /** El color usado como texto sobre blanco: oscurecido lo justo hasta 4.5:1 (WCAG 1.4.3). */
  readonly text: string;
  /** Bordes y anillo de foco sobre blanco: oscurecido lo justo hasta 3:1 (WCAG 1.4.11). */
  readonly border: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const hexColor = z
  .string()
  .regex(HEX)
  .transform((value) => value.toLowerCase());

/** Marca de la organización o tema del paciente (RN-H03): solo colores #RRGGBB. */
export const brandSchema = z.object({ primary: hexColor, secondary: hexColor.optional() });

/** Valida la marca; lo inválido vuelve a la paleta provisional y nunca llega al CSS. */
export function parseBrand(input: unknown): Brand {
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return DEFAULT_BRAND;
  return {
    primary: parsed.data.primary,
    secondary: parsed.data.secondary ?? DEFAULT_BRAND.secondary,
  };
}

type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Luminancia relativa de WCAG 2.2. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores, de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Oscurece hacia negro en pasos de 2 % hasta alcanzar `minimum` sobre blanco. */
function darkenUntil(hex: string, minimum: number): string {
  const rgb = toRgb(hex);
  for (let step = 0; step <= 50; step += 1) {
    const candidate = toHex(rgb.map((c) => c * (1 - step * 0.02)) as unknown as Rgb);
    if (contrastRatio(candidate, '#ffffff') >= minimum) return candidate;
  }
  return '#000000';
}

export function brandTokens(hex: string): BrandColorTokens {
  const base = hex.toLowerCase();
  const foreground =
    contrastRatio('#ffffff', base) >= contrastRatio('#000000', base) ? '#ffffff' : '#000000';
  return { base, foreground, text: darkenUntil(base, 4.5), border: darkenUntil(base, 3) };
}

/** Variables CSS de la marca. Los componentes solo leen tokens; esto es lo único que cambia en ejecución. */
export function brandVariables(brand: Brand): Record<`--brand-${string}`, string> {
  const primary = brandTokens(brand.primary);
  const secondary = brandTokens(brand.secondary);
  return {
    '--brand-primary': primary.base,
    '--brand-primary-foreground': primary.foreground,
    '--brand-primary-text': primary.text,
    '--brand-primary-border': primary.border,
    '--brand-secondary': secondary.base,
    '--brand-secondary-foreground': secondary.foreground,
    '--brand-secondary-text': secondary.text,
    '--brand-secondary-border': secondary.border,
  };
}

/** `:root{--brand-…}` con valores ya validados: no admite inyección de CSS. */
export function brandCss(brand: Brand): string {
  const declarations = Object.entries(brandVariables(brand)).map(
    ([name, value]) => `${name}:${value}`,
  );
  return `:root{${declarations.join(';')}}`;
}
