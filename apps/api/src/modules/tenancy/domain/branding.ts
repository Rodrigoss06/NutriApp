import { domainError, type DomainError } from '@nutricoach/shared-kernel';

/**
 * Lo que se escribe de una marca (RN-H03): nombre visible, colores, contacto y pie de las fichas. El logo va aparte,
 * con su propia subida. En P11 solo se edita la de la organización; la propia de cada profesional, en P15.
 */
export interface BrandingText {
  readonly displayName: string | null;
  /** #rrggbb; null usa la paleta provisional (ADR-027). */
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly contact: {
    readonly phone: string | null;
    readonly email: string | null;
    readonly website: string | null;
  };
  readonly pdfFooter: string | null;
}

export const EMPTY_BRANDING: BrandingText = {
  displayName: null,
  primaryColor: null,
  secondaryColor: null,
  contact: { phone: null, email: null, website: null },
  pdfFooter: null,
};

/**
 * El logo (ADR-066): un PNG o JPEG entero, de 1 MB y 2000 px por lado como máximo. Va en cada ficha y react-pdf lo
 * descomprime al dibujar: uno dañado rompería todas las fichas de la organización y uno enorme las haría lentas (RNF-04).
 */
export const LOGO_RULES = { maxBytes: 1024 * 1024, maxSidePx: 2000 } as const;

export const LOGO_UNSUPPORTED = domainError({
  code: 'NC-TEN-040',
  message: 'El logo debe ser una imagen PNG o JPG que se abra bien.',
});
export const LOGO_TOO_LARGE = domainError({
  code: 'NC-TEN-041',
  message: 'El logo mide más de 2000 px de lado. Redúcelo y vuelve a subirlo.',
});
export const LOGO_TOO_HEAVY = domainError({
  code: 'NC-TEN-042',
  message: 'El logo pesa más de 1 MB. Redúcelo y vuelve a subirlo.',
});

/** Lo que dijo la revisión de la imagen entera (platform). */
export interface LogoInspection {
  readonly status: 'OK' | 'TOO_LARGE' | 'INVALID';
}

export function checkLogo(inspection: LogoInspection, sizeBytes: number): DomainError | null {
  if (sizeBytes > LOGO_RULES.maxBytes) return LOGO_TOO_HEAVY;
  if (inspection.status === 'INVALID') return LOGO_UNSUPPORTED;
  if (inspection.status === 'TOO_LARGE') return LOGO_TOO_LARGE;
  return null;
}

/** Los campos que cambian, por su nombre: el evento y la auditoría nunca llevan valores (02 §8). */
export function changedBrandingFields(
  current: BrandingText | null,
  next: BrandingText,
): readonly string[] {
  const before = current ?? EMPTY_BRANDING;
  const fields: string[] = [];
  for (const key of ['displayName', 'primaryColor', 'secondaryColor'] as const) {
    if (before[key] !== next[key]) fields.push(key);
  }
  for (const key of ['phone', 'email', 'website'] as const) {
    if (before.contact[key] !== next.contact[key]) fields.push(`contact.${key}`);
  }
  if (before.pdfFooter !== next.pdfFooter) fields.push('pdfFooter');
  return fields;
}
