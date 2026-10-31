import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../../clinical/index.js';
import { ExerciseApi } from '../../../exercise/index.js';
import { exerciseIdsOf, programProblems } from '../../domain/program.js';
import {
  PROGRAM_STORE,
  type ProgramStore,
  type ProgramSummaryRecord,
} from '../ports/program.ports.js';
import { programDocument, type ProgramDocument } from '../program-document.js';
import { TrainingSafety } from '../training-safety.js';

export interface ProgramView extends ProgramSummaryRecord {
  readonly document: ProgramDocument;
  readonly publishProblems: readonly string[];
}

/** Lecturas del programa (RF-26). La RLS aplica RN-A05; cada lectura deja un READ en la auditoría (RN-B03). */
@Injectable()
export class ProgramQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(TrainingSafety) private readonly safety: TrainingSafety,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(ExerciseApi) private readonly exercises: ExerciseApi,
  ) {}

  /** null si no se ve al paciente. */
  async list(
    context: SecurityContext,
    patientId: string,
  ): Promise<readonly ProgramSummaryRecord[] | null> {
    const rows = await this.uow.query(context, async () =>
      (await this.clinical.patientRef(patientId)) ? this.programs.listByPatient(patientId) : null,
    );
    if (!rows) return null;
    await this.#audited(context, patientId, patientId);
    return rows;
  }

  /**
   * Un programa: en borrador, armado con la biblioteca de hoy y con lo que falta para publicar; publicado o reemplazado, lo que se
   * congeló (RN-F12). null si no existe o no se ve.
   */
  async get(context: SecurityContext, id: string): Promise<ProgramView | null> {
    const view = await this.uow.query(context, async (): Promise<ProgramView | null> => {
      const program = await this.programs.find(id);
      if (!program) return null;
      const { mesocycles, ...summary } = program;
      if (program.status !== 'DRAFT') {
        const snapshot = await this.programs.snapshot(id);
        if (!snapshot) return null;
        return { ...summary, document: snapshot, publishProblems: [] };
      }
      const safety = await this.safety.of(program.patientId);
      return {
        ...summary,
        document: programDocument(
          mesocycles,
          await this.exercises.exercisesById(exerciseIdsOf(mesocycles)),
        ),
        publishProblems: [
          ...(program.origin === 'PROPOSAL' && safety.blocked
            ? ['Una llave de seguridad sigue cerrada: la propuesta no se publica.']
            : []),
          ...programProblems(program),
        ],
      };
    });
    if (!view) return null;
    await this.#audited(context, id, view.patientId);
    return view;
  }

  async #audited(context: SecurityContext, resourceId: string, patientId: string): Promise<void> {
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'training.program',
      resourceId: resourceId as Id<string>,
      patientId: patientId as PatientId,
    });
  }
}
