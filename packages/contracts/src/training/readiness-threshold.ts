import { z } from 'zod';
import { upToDecimals } from '../decimals.js';

const score = (label: string) =>
  z
    .number()
    .min(0, `${label}: de 0 a 100.`)
    .max(100, `${label}: de 0 a 100.`)
    .refine(upToDecimals(2), 'Usa hasta 2 decimales.');

/** Los umbrales de 07 §11, editables por organización y versionados (RN-G15, RN-G16). */
export const readinessThresholdValuesSchema = z
  .strictObject({
    neutralScore: score('El valor neutral'),
    readinessGreenMin: score('La recuperación verde'),
    readinessRedBelow: score('La recuperación roja'),
    performanceMinPct: z.number().min(0).max(120).refine(upToDecimals(2), 'Usa hasta 2 decimales.'),
    weeklySleepMinHours: z.number().min(0).max(24).refine(upToDecimals(1), 'Usa hasta 1 decimal.'),
    fatigueSorenessAmberAbove: z
      .number()
      .min(1)
      .max(5)
      .refine(upToDecimals(1), 'Usa hasta 1 decimal.'),
    nutritionMinPct: score('La alimentación mínima'),
  })
  .refine((values) => values.readinessRedBelow <= values.readinessGreenMin, {
    path: ['readinessRedBelow'],
    message: 'La recuperación roja no puede pasar a la verde.',
  });
export type ReadinessThresholdValues = z.infer<typeof readinessThresholdValuesSchema>;

const thresholdSchema = z.object({
  id: z.uuid(),
  validFrom: z.iso.date(),
  neutralScore: z.number(),
  readinessGreenMin: z.number(),
  readinessRedBelow: z.number(),
  performanceMinPct: z.number(),
  weeklySleepMinHours: z.number(),
  fatigueSorenessAmberAbove: z.number(),
  nutritionMinPct: z.number(),
});

export const readinessThresholdsResponseSchema = z.object({
  current: thresholdSchema,
  base: thresholdSchema,
  /** true si rigen los de la organización; false, los de la V3. */
  own: z.boolean(),
});
export type ReadinessThresholdsResponse = z.infer<typeof readinessThresholdsResponseSchema>;
