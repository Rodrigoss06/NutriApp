import { Inject, Injectable } from '@nestjs/common';
import { PROGRAM_STORE, type ProgramStore } from './ports/program.ports.js';
import type { ProgramSnapshot } from './program-document.js';

/**
 * API pública de training (02 §2): lo que otros contextos leen de un programa publicado, siempre su snapshot (RN-F12). Se llama
 * dentro de la transacción de quien la usa.
 */
@Injectable()
export class TrainingApi {
  constructor(@Inject(PROGRAM_STORE) private readonly programs: ProgramStore) {}

  /** null si no existe, sigue en borrador o no se ve. */
  publishedProgram(id: string): Promise<ProgramSnapshot | null> {
    return this.programs.snapshot(id);
  }
}
