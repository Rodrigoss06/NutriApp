import { z } from 'zod';
import { upToDecimals } from '../decimals.js';

const isoDate = z.iso.date();
const decimals = (digits: number) =>
  [upToDecimals(digits), `Usa hasta ${String(digits)} decimales.`] as const;

/** P-21: el check-in de la semana se completa del domingo al martes siguiente (ADR-109). */
export const WEEKLY_CHECKIN_OPEN_DAYS = 3;

/** POST /api/v1/me/weekly-checkins: el check-in de la semana (P-21, P-22; ADR-109). Otra vez en el plazo, lo corrige (RN-G12). */
export const logWeeklyCheckinSchema = z.strictObject({
  clientId: z.uuid(),
  /** El domingo de la semana: el del check-in abierto hoy. */
  weekDate: isoDate,
  /** Cuánto siguió su plan de alimentación esta semana, de 0 a 100 %: lo declara el paciente (P-22). */
  nutritionCompliancePct: z.int().min(0).max(100),
  /** El peso de hoy, si su app lo permite: de 20 a 300 kg (RN-C04). */
  bodyWeightKg: z
    .number()
    .min(20)
    .max(300)
    .refine(...decimals(2))
    .nullable()
    .default(null),
  /** Llega a su equipo como una nota sin leer (RN-G13). */
  comment: z.string().trim().min(1).max(2_000).nullable().default(null),
});
export type LogWeeklyCheckin = z.input<typeof logWeeklyCheckinSchema>;

export const weeklyCheckinSchema = z.object({
  id: z.uuid(),
  weekDate: isoDate,
  /** El día en que lo envió: el de su peso y su nota. */
  loggedOn: isoDate,
  nutritionCompliancePct: z.int().min(0).max(100),
  withWeight: z.boolean(),
  withComment: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type WeeklyCheckin = z.infer<typeof weeklyCheckinSchema>;

/** En Hoy: el check-in abierto de esta semana, del domingo al martes; de miércoles a sábado, null. */
export const meWeeklyCheckinSchema = z.object({
  weekDate: isoDate,
  /** El martes siguiente: el último día para completarlo. */
  closesOn: isoDate,
  /** Si su app permite el peso en casa (content). */
  asksWeight: z.boolean(),
  /** El que ya envió esta semana; otra vez lo corrige. */
  done: weeklyCheckinSchema.nullable(),
});
export type MeWeeklyCheckin = z.infer<typeof meWeeklyCheckinSchema>;
