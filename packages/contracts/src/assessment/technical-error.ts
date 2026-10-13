import { z } from 'zod';
import { SITE_FAMILIES, SITE_UNITS } from './catalog.js';
import { measuredValueSchema } from './evaluation.js';

const isoDate = z.iso.date();

export const TEM_SOURCES = ['CALCULATED', 'DECLARED'] as const;

const uniqueSites = (sites: readonly { siteCode: string }[]) =>
  new Set(sites.map(({ siteCode }) => siteCode)).size === sites.length;

/**
 * POST /api/v1/members/:memberId/technical-errors (RN-C05, RF-12): el ETM del evaluador por sitio, vigente desde
 * `validFrom`. CALCULATED: un estudio de repetibilidad con pares de 1.ª y 2.ª toma por sitio (TEM_ISAK); se guardan
 * los pares para recalcular el %ETM agrupado. DECLARED: el evaluador escribe su ETM y su %ETM por sitio, por ejemplo
 * los de su acreditación ISAK. Lo registra el propio miembro, o OWNER y ADMIN para cualquiera de su organización.
 */
export const recordTechnicalErrorSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('CALCULATED'),
    validFrom: isoDate,
    sites: z
      .array(
        z.object({
          siteCode: z.string(),
          pairs: z
            .array(z.tuple([measuredValueSchema, measuredValueSchema]))
            .min(1)
            .max(200),
        }),
      )
      .min(1)
      .refine(uniqueSites, 'Cada sitio va una sola vez.'),
  }),
  z.object({
    source: z.literal('DECLARED'),
    validFrom: isoDate,
    sites: z
      .array(
        z.object({
          siteCode: z.string(),
          temAbs: z.number().positive().max(9999),
          temRelPct: z.number().positive().max(999),
          sampleSize: z.number().int().positive().nullable().optional(),
        }),
      )
      .min(1)
      .refine(uniqueSites, 'Cada sitio va una sola vez.'),
  }),
]);
export type RecordTechnicalError = z.input<typeof recordTechnicalErrorSchema>;

/** ETM vigente de un sitio, con su CMD95 = 1.96 × √2 × ETM (MDC95). */
export const technicalErrorSchema = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  siteCode: z.string(),
  source: z.enum(TEM_SOURCES),
  temAbs: z.number(),
  temRelPct: z.number(),
  mdc95: z.number(),
  sampleSize: z.number().int().nullable(),
  /** Pares del estudio; null si el ETM es declarado. */
  pairs: z.array(z.tuple([z.number(), z.number()])).nullable(),
  validFrom: isoDate,
  createdAt: z.iso.datetime(),
});
export type TechnicalError = z.infer<typeof technicalErrorSchema>;

/**
 * ETM agrupado de una familia (TEM_ISAK sobre todos los pares de sus sitios con estudio): con los seis pliegues de
 * Luis da 0.374 mm (2.35 %) y un CMD95 de 1.04 mm (G-04). Los sitios declarados no entran: no tienen pares.
 */
export const pooledTechnicalErrorSchema = z.object({
  family: z.enum(SITE_FAMILIES),
  unit: z.enum(SITE_UNITS),
  siteCodes: z.array(z.string()),
  temAbs: z.number(),
  temRelPct: z.number(),
  mdc95: z.number(),
  methodCode: z.literal('TEM_ISAK'),
  methodVersion: z.string(),
});
export type PooledTechnicalError = z.infer<typeof pooledTechnicalErrorSchema>;

/** GET /api/v1/members/:memberId/technical-errors: el ETM vigente por sitio y el agrupado por familia. */
export const technicalErrorsResponseSchema = z.object({
  memberId: z.uuid(),
  current: z.array(technicalErrorSchema),
  pooled: z.array(pooledTechnicalErrorSchema),
});
export type TechnicalErrorsResponse = z.infer<typeof technicalErrorsResponseSchema>;
