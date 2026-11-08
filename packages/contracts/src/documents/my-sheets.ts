import { z } from 'zod';

/**
 * Las fichas en la app del paciente (ADR-080, ADR-095): solo las vigentes. La API elige el origen de cada una: el plan y la rutina
 * que el paciente ve en su app, y su última evaluación cerrada (sus resultados y, con dos o más, su evolución).
 */
export const MY_SHEET_ITEMS = ['PLAN', 'PROGRAM', 'RESULTS', 'EVOLUTION'] as const;
export type MySheetItem = (typeof MY_SHEET_ITEMS)[number];

/** GET /api/v1/me/documents: las fichas que el paciente puede descargar ahora. */
export const mySheetsSchema = z.object({
  sheets: z.array(z.object({ item: z.enum(MY_SHEET_ITEMS) })),
});
export type MySheets = z.infer<typeof mySheetsSchema>;

/** POST /api/v1/me/documents y GET /api/v1/me/documents/status?item=: cuál de ellas. */
export const mySheetRequestSchema = z.strictObject({ item: z.enum(MY_SHEET_ITEMS) });
export type MySheetRequest = z.input<typeof mySheetRequestSchema>;
