import { z } from 'zod';

/**
 * Cribado previo al ejercicio V2 (RN-F15, 07 §3.2), de la hoja `02_Form_Cribado`. Se responde Sí o No; una respuesta
 * afirmativa no equivale por sí sola a un diagnóstico. No vuelve a pedir correo ni nombre, que ya están en la ficha.
 */
export const SCREENING_QUESTIONS = [
  {
    code: 'S01',
    critical: true,
    label:
      '¿Alguna vez un médico te ha indicado que tienes un problema cardíaco o presión arterial alta?',
  },
  { code: 'S02', critical: true, label: '¿Sientes dolor en el pecho durante la actividad física?' },
  { code: 'S03', critical: true, label: '¿Has tenido dolor en el pecho en reposo?' },
  {
    code: 'S04',
    critical: true,
    label: '¿Pierdes el equilibrio por mareos o has perdido la conciencia?',
  },
  {
    code: 'S05',
    critical: false,
    label: '¿Tienes una condición crónica que pueda influir en la práctica del ejercicio?',
  },
  {
    code: 'S06',
    critical: false,
    label: '¿Tomas medicamentos para el corazón o la presión arterial?',
  },
  {
    code: 'S07',
    critical: false,
    label: '¿Tienes un problema óseo, articular o muscular que pudiera empeorar con el ejercicio?',
  },
  {
    code: 'S08',
    critical: false,
    label:
      '¿Existe otra condición, lesión, cirugía reciente, embarazo u otra situación que pueda afectar la realización segura de actividad física?',
  },
] as const;

export const SCREENING_DETAIL_LABEL =
  'Si respondiste Sí a alguna pregunta, describe la situación con el mayor detalle posible';

export const SCREENING_STATUS_CODES = ['GREEN', 'AMBER', 'RED'] as const;
export const SCREENING_DECISION_CODES = ['START', 'LIMIT', 'REFER'] as const;

const yesNo = z.boolean();

/** Todas las preguntas se responden: un cribado a medias no dice nada de la seguridad. */
export const screeningAnswersSchema = z.strictObject({
  S01: yesNo,
  S02: yesNo,
  S03: yesNo,
  S04: yesNo,
  S05: yesNo,
  S06: yesNo,
  S07: yesNo,
  S08: yesNo,
  S09: z.string().trim().max(2_000).optional(),
});
export type ScreeningAnswers = z.infer<typeof screeningAnswersSchema>;

/** POST /api/v1/patients/:id/screenings: cada respuesta es una fila nueva; queda el historial (07 §3.2). */
export const recordScreeningSchema = z.strictObject({ answers: screeningAnswersSchema });
export type RecordScreening = z.infer<typeof recordScreeningSchema>;

/** POST /api/v1/patients/:id/screenings/:screeningId/review: la decisión del coach, con su nota (RN-F15). */
export const reviewScreeningSchema = z.strictObject({
  decision: z.enum(SCREENING_DECISION_CODES),
  note: z.string().trim().min(1).max(2_000),
});
export type ReviewScreening = z.infer<typeof reviewScreeningSchema>;

export const screeningSchema = z.object({
  id: z.uuid(),
  formVersion: z.string(),
  ruleVersion: z.string(),
  answers: screeningAnswersSchema,
  status: z.enum(SCREENING_STATUS_CODES),
  answeredBy: z.uuid(),
  answeredAt: z.iso.datetime(),
  review: z
    .object({
      decision: z.enum(SCREENING_DECISION_CODES),
      note: z.string(),
      reviewedBy: z.uuid(),
      reviewedAt: z.iso.datetime(),
    })
    .nullable(),
});
export type Screening = z.infer<typeof screeningSchema>;

export const screeningListResponseSchema = z.object({ screenings: z.array(screeningSchema) });
export type ScreeningListResponse = z.infer<typeof screeningListResponseSchema>;
