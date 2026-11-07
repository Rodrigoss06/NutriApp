import { Inject, Injectable } from '@nestjs/common';
import type { ProgramStatus } from '../domain/program.js';
import type { WeeklyLight } from '../domain/weekly-review.js';
import { PROGRAM_STORE, type ProgramStore } from './ports/program.ports.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from './ports/weekly-review.ports.js';
import type { ProgramSnapshot } from './program-document.js';

/** Los controles semanales del programa vigente, para las alertas del panel (RF-34). */
export interface ReviewOverview {
  /** El control vigente de la semana más reciente; null si el programa todavía no tiene ninguno. */
  readonly latest: { readonly weekEnd: string; readonly light: WeeklyLight } | null;
  /** Los controles vigentes que esperan la decisión del coach (RN-F17). */
  readonly undecided: number;
}

/**
 * API pública de training (02 §2): lo que otros contextos leen de un programa publicado, siempre su snapshot (RN-F12). Se llama
 * dentro de la transacción de quien la usa.
 */
@Injectable()
export class TrainingApi {
  constructor(
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(WEEKLY_REVIEW_STORE) private readonly reviews: WeeklyReviewStore,
  ) {}

  /** null si no existe, sigue en borrador o no se ve. */
  publishedProgram(id: string): Promise<ProgramSnapshot | null> {
    return this.programs.snapshot(id);
  }

  /**
   * La última versión publicada de una línea, vigente o reemplazada: la que dice qué se programó en cada semana, porque una versión
   * nueva copia las semanas ya pasadas tal como estaban (RN-F12). null si no hay ninguna o no se ve.
   */
  latestPublishedOfLineage(lineageId: string): Promise<ProgramSnapshot | null> {
    return this.programs.latestSnapshot(lineageId);
  }

  /** Su estado: así quien lo pide sabe si es un borrador o algo que no existe. null si no existe o no se ve. */
  programStatus(id: string): Promise<ProgramStatus | null> {
    return this.programs.status(id);
  }

  /** Los controles de la línea del programa vigente del paciente; sin programa publicado, ninguno. */
  async reviewOverview(patientId: string): Promise<ReviewOverview> {
    const program = await this.reviews.publishedProgramOf(patientId);
    if (!program) return { latest: null, undecided: 0 };
    const current = (await this.reviews.listOfLineage(program.lineageId)).filter(
      (review) => review.status === 'CURRENT',
    );
    const latest = current.reduce<(typeof current)[number] | null>(
      (last, review) => (!last || review.weekNo > last.weekNo ? review : last),
      null,
    );
    return {
      latest: latest ? { weekEnd: latest.weekEnd, light: latest.light } : null,
      undecided: current.filter((review) => review.coachDecision === null).length,
    };
  }
}
