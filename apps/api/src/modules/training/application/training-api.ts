import { Inject, Injectable } from '@nestjs/common';
import type { ProgramStatus } from '../domain/program.js';
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

  /** Su estado: así quien lo pide sabe si es un borrador o algo que no existe. null si no existe o no se ve. */
  programStatus(id: string): Promise<ProgramStatus | null> {
    return this.programs.status(id);
  }
}
