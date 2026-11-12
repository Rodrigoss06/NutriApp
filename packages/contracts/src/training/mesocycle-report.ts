import { z } from 'zod';
import { evolutionResponseSchema } from '../assessment/evolution.js';
import { COACH_DECISIONS, WEEKLY_ACTIONS, WEEKLY_LIGHTS } from './weekly-review.js';

const isoDate = z.iso.date();
const amount = z.number().nullable();
const count = z.int().nonnegative();
const methodRef = z.object({ code: z.string(), version: z.string() });

export const MESOCYCLE_REPORT_STATUSES = ['DRAFT', 'SENT'] as const;

/** Los textos del coach, como los rotula la hoja de Jeremy (P-28). */
export const MESOCYCLE_REPORT_TEXT_LABELS = {
  achievement: 'Logro principal',
  limitation: 'Limitante',
  adjustment: 'Ajuste principal',
  priority: 'Prioridad siguiente',
} as const;

export const MESOCYCLE_REPORT_TEXT_MAX = 1000;

const text = z
  .string()
  .trim()
  .max(MESOCYCLE_REPORT_TEXT_MAX, `Hasta ${String(MESOCYCLE_REPORT_TEXT_MAX)} caracteres.`)
  .nullable();

/** POST /patients/:id/mesocycle-reports: el borrador del informe de un mesociclo del programa (RN-G19). */
export const createMesocycleReportSchema = z.strictObject({
  programId: z.uuid(),
  mesocyclePosition: z.int().positive(),
});
export type CreateMesocycleReport = z.infer<typeof createMesocycleReportSchema>;

/** PUT /mesocycle-reports/:id con If-Match: los cuatro textos del borrador; vacío es «sin escribir». */
export const saveMesocycleReportSchema = z.strictObject({
  achievement: text,
  limitation: text,
  adjustment: text,
  priority: text,
});
export type SaveMesocycleReport = z.infer<typeof saveMesocycleReportSchema>;

/** PUT /me/mesocycle-reports/:id/comment: el comentario del alumno; vacío lo borra. */
export const mesocycleReportCommentSchema = z.strictObject({ comment: text });
export type MesocycleReportComment = z.infer<typeof mesocycleReportCommentSchema>;

export const mesocycleReportWeekSchema = z.object({
  weekNo: z.int().positive(),
  plannedSets: count,
  doneSets: count,
  /** Series hechas × 100 ÷ planificadas, sin redondear (RN-D09); null sin series planificadas. */
  volumePct: amount,
  sessionsPlanned: count,
  sessionsDone: count,
  records: count,
  sleepHours: amount,
  stress: amount,
  fatigue: amount,
  performancePct: amount,
  nutritionPct: amount,
});

/** El resultado de MESOCYCLE_REPORT_JV con su método (RN-D01): volumen cumplido, récords y promedios. */
export const mesocycleReportNumbersSchema = z.object({
  method: methodRef,
  engineVersion: z.string(),
  inputsHash: z.string(),
  weeks: z.array(mesocycleReportWeekSchema),
  total: z.object({
    plannedSets: count,
    doneSets: count,
    volumePct: amount,
    sessionsPlanned: count,
    sessionsDone: count,
    records: count,
  }),
  averages: z.object({
    sleepHours: amount,
    stress: amount,
    fatigue: amount,
    performancePct: amount,
    nutritionPct: amount,
  }),
  records: z.array(
    z.object({
      exerciseId: z.uuid(),
      exerciseName: z.string(),
      weekNo: z.int().positive(),
      localDate: isoDate,
      estimated1rmKg: z.number().positive(),
      previousBestKg: z.number().positive(),
    }),
  ),
});

/** Lo que muestra el informe: calculado al leer el borrador, o congelado al enviarlo (RN-D08). */
export const mesocycleReportBodySchema = z.object({
  schemaVersion: z.literal(1),
  computedOn: isoDate,
  program: z.object({
    programId: z.uuid(),
    name: z.string(),
    versionNo: z.int().positive(),
    /** El método del 1RM de los récords (RN-F04, RN-D02); null con una fórmula sin método. */
    oneRmMethod: methodRef.nullable(),
  }),
  mesocycle: z.object({
    position: z.int().positive(),
    name: z.string(),
    startDate: isoDate,
    endDate: isoDate,
    weeks: z.array(
      z.object({
        weekNo: z.int().positive(),
        weekStart: isoDate,
        weekEnd: isoDate,
        isDeload: z.boolean(),
        started: z.boolean(),
      }),
    ),
  }),
  /** null si ninguna semana del mesociclo empezó. */
  numbers: mesocycleReportNumbersSchema.nullable(),
  /** El control semanal vigente de cada semana que lo tiene (07 §10). */
  reviews: z.array(
    z.object({
      weekNo: z.int().positive(),
      light: z.enum(WEEKLY_LIGHTS),
      suggestedAction: z.enum(WEEKLY_ACTIONS),
      suggestedVolumeFactor: amount,
      coachDecision: z.enum(COACH_DECISIONS).nullable(),
      decidedVolumeFactor: amount,
      method: methodRef,
    }),
  ),
  /** La evolución hasta el último día del mesociclo, con lo de la comparativa física (ADR-107); null sin evaluaciones. */
  evolution: evolutionResponseSchema.nullable(),
});
export type MesocycleReportBody = z.infer<typeof mesocycleReportBodySchema>;

/** GET /mesocycle-reports/:id y GET /me/mesocycle-reports/:id (RN-G19). */
export const mesocycleReportSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  mesocyclePosition: z.int().positive(),
  status: z.enum(MESOCYCLE_REPORT_STATUSES),
  achievement: z.string().nullable(),
  limitation: z.string().nullable(),
  adjustment: z.string().nullable(),
  priority: z.string().nullable(),
  studentComment: z.string().nullable(),
  studentCommentedAt: z.iso.datetime().nullable(),
  sentAt: z.iso.datetime().nullable(),
  version: count,
  /** Si ya cerró la última semana del mesociclo: solo entonces se envía. */
  closed: z.boolean(),
  body: mesocycleReportBodySchema.nullable(),
});
export type MesocycleReport = z.infer<typeof mesocycleReportSchema>;

/** GET /patients/:id/mesocycle-reports: los mesociclos del programa, cada uno con su informe si lo tiene. */
export const mesocycleReportsResponseSchema = z.object({
  program: z.object({ programId: z.uuid(), lineageId: z.uuid(), name: z.string() }).nullable(),
  mesocycles: z.array(
    z.object({
      position: z.int().positive(),
      name: z.string(),
      startDate: isoDate,
      endDate: isoDate,
      closed: z.boolean(),
      report: z
        .object({
          id: z.uuid(),
          status: z.enum(MESOCYCLE_REPORT_STATUSES),
          version: count,
          sentAt: z.iso.datetime().nullable(),
          hasComment: z.boolean(),
        })
        .nullable(),
    }),
  ),
});
export type MesocycleReportsResponse = z.infer<typeof mesocycleReportsResponseSchema>;

/** GET /me/mesocycle-reports: los informes enviados del alumno, del más reciente al más antiguo. */
export const patientMesocycleReportsResponseSchema = z.object({
  reports: z.array(
    z.object({
      id: z.uuid(),
      programName: z.string(),
      mesocyclePosition: z.int().positive(),
      mesocycleName: z.string(),
      startDate: isoDate,
      endDate: isoDate,
      sentAt: z.iso.datetime(),
      hasComment: z.boolean(),
    }),
  ),
});
export type PatientMesocycleReportsResponse = z.infer<typeof patientMesocycleReportsResponseSchema>;

export const mesocycleReportVersionSchema = z.object({ id: z.uuid(), version: count });
export type MesocycleReportVersion = z.infer<typeof mesocycleReportVersionSchema>;

export const mesocycleReportCommentResponseSchema = z.object({
  studentComment: z.string().nullable(),
  studentCommentedAt: z.iso.datetime().nullable(),
});
export type MesocycleReportCommentResponse = z.infer<typeof mesocycleReportCommentResponseSchema>;
