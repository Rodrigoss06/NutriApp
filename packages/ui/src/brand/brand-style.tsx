import { brandCss, parseBrand } from './brand-tokens';

export interface BrandStyleProps {
  /** Marca de la organización o tema del paciente; lo inválido vuelve a la paleta provisional. */
  readonly brand: unknown;
}

/**
 * Pinta las variables --brand-* desde el servidor, sin useEffect: la primera pintura ya trae la marca y no
 * parpadea el color por defecto (RN-H03). Va en :root y no en un contenedor porque los diálogos y menús se
 * montan en <body> (portales de Radix) y también deben llevar la marca. Requiere style-src 'unsafe-inline'
 * en la CSP (los scripts siguen estrictos).
 */
export function BrandStyle({ brand }: BrandStyleProps) {
  const css = brandCss(parseBrand(brand));
  return (
    <style href={`brand-${css.length.toString(36)}-${hash(css)}`} precedence="high">
      {css}
    </style>
  );
}

/** Huella corta para que React deduplique el <style> hoisteado; no es seguridad. */
function hash(text: string): string {
  let h = 0;
  for (const char of text) h = (Math.imul(31, h) + char.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
