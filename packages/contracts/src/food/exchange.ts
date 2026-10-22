import { z } from 'zod';

/** Un grupo de intercambio: lo que aporta un intercambio, en gramos y kcal (RN-E11). */
export const exchangeGroupSchema = z.object({
  code: z.string(),
  name: z.string(),
  choG: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  kcal: z.number(),
});
export type ExchangeGroup = z.infer<typeof exchangeGroupSchema>;

/** Una lista de intercambio publicada y versionada, con sus grupos en orden (RN-E11). */
export const exchangeListSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  version: z.string(),
  /** Sin permiso de sus autores todavía (riesgo R4): la pantalla la rotula. */
  provisional: z.boolean(),
  note: z.string().nullable(),
  groups: z.array(exchangeGroupSchema),
});
export type ExchangeList = z.infer<typeof exchangeListSchema>;

/** GET /api/v1/exchange-lists */
export const exchangeListResponseSchema = z.object({ lists: z.array(exchangeListSchema) });
export type ExchangeListResponse = z.infer<typeof exchangeListResponseSchema>;
