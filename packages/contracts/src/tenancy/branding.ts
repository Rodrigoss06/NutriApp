import { z } from 'zod';
import { hexColorSchema } from '../presentation/brand-tokens.js';

/**
 * Marca de las fichas de la organización (RN-H03, P11): GET y PUT /api/v1/organization/branding, y el logo aparte en
 * PUT y DELETE /api/v1/organization/branding/logo. Los largos dejan el encabezado y el pie de la ficha dentro de su
 * espacio (ADR-066).
 */
export const BRANDING_LIMITS = {
  displayName: 60,
  phone: 30,
  email: 80,
  website: 60,
  pdfFooter: 120,
} as const;

/** El logo (ADR-066): PNG o JPEG entero, de 1 MB y 2000 px por lado como máximo. La API lo revisa entero. */
export const LOGO_LIMITS = {
  maxBytes: 1024 * 1024,
  maxSidePx: 2000,
  accept: 'image/png,image/jpeg',
} as const;

/** Vacío o solo espacios es «sin dato»: llega como null. */
const blankAsNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    schema.nullable(),
  );

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Hasta ${String(max)} caracteres.`);

export const updateBrandingSchema = z.object({
  displayName: blankAsNull(
    text(BRANDING_LIMITS.displayName).min(2, 'Escribe al menos 2 caracteres.'),
  ),
  /** null: la paleta provisional (ADR-027). */
  primaryColor: hexColorSchema.nullable(),
  secondaryColor: hexColorSchema.nullable(),
  contact: z.object({
    phone: blankAsNull(
      text(BRANDING_LIMITS.phone).regex(
        /^\+?[\d\s()-]{6,}$/,
        'Escribe solo números, espacios, +, guiones o paréntesis.',
      ),
    ),
    email: blankAsNull(text(BRANDING_LIMITS.email).pipe(z.email('Escribe un correo válido.'))),
    website: blankAsNull(
      text(BRANDING_LIMITS.website).regex(
        /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i,
        'Escribe una dirección web, por ejemplo consultorio.pe.',
      ),
    ),
  }),
  pdfFooter: blankAsNull(text(BRANDING_LIMITS.pdfFooter)),
});
export type UpdateBranding = z.input<typeof updateBrandingSchema>;

export const brandingResponseSchema = z.object({
  displayName: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  contact: z.object({
    phone: z.string().nullable(),
    email: z.string().nullable(),
    website: z.string().nullable(),
  }),
  pdfFooter: z.string().nullable(),
  /** El logo vigente: se ve en GET /api/v1/organization/branding/logo. */
  logoFileId: z.uuid().nullable(),
  /** null si nadie la fijó: las fichas van con el nombre de la organización y la paleta provisional. */
  updatedAt: z.iso.datetime().nullable(),
});
export type BrandingResponse = z.infer<typeof brandingResponseSchema>;
