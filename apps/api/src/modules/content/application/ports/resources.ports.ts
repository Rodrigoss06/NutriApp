import type { ResourceChanges, ResourceRecord, ResourceStatus } from '../../domain/resources.js';

/** Un recurso de la biblioteca con cuántos de los pacientes que el contexto ve lo tienen asignado. */
export interface ResourceSummary extends Omit<ResourceRecord, 'bodyMarkdown'> {
  readonly assignedCount: number;
}

/** Un recurso asignado a un paciente: cuándo y si ya lo abrió. */
export interface AssignmentView {
  readonly resource: Omit<ResourceRecord, 'bodyMarkdown'>;
  readonly assignedAt: Date;
  readonly viewedAt: Date | null;
}

/**
 * content.educational_resource y content.resource_assignment, con la transacción de quien llama y su RLS: el equipo ve la biblioteca
 * de su organización y las asignaciones de sus pacientes (RN-A05); el paciente, solo lo que tiene asignado.
 */
export interface ResourceStore {
  /** La biblioteca, lo más nuevo primero; con estado, solo los de ese estado. */
  library(status: ResourceStatus | null): Promise<readonly ResourceSummary[]>;
  find(id: string): Promise<ResourceRecord | null>;
  insert(row: ResourceRecord & { readonly organizationId: string }): Promise<void>;
  update(id: string, changes: ResourceChanges): Promise<void>;
  /** Lo asignado al paciente, lo más nuevo primero; con soloVigentes, sin lo archivado. */
  assignments(patientId: string, activeOnly: boolean): Promise<readonly AssignmentView[]>;
  /** La asignación de ese recurso a ese paciente; null si no existe o no se ve. */
  assignment(resourceId: string, patientId: string): Promise<AssignmentView | null>;
  /** false si ya estaba asignado: repetir no duplica. */
  assign(row: {
    readonly resourceId: string;
    readonly patientId: string;
    readonly organizationId: string;
    readonly assignedBy: string;
    readonly assignedAt: Date;
  }): Promise<boolean>;
  /** false si no estaba asignado. */
  unassign(resourceId: string, patientId: string): Promise<boolean>;
  /** Solo en la sesión del paciente: marca la primera vez que lo abrió (app.mark_resource_viewed). false si ya estaba. */
  markViewed(resourceId: string): Promise<boolean>;
}

export const RESOURCE_STORE = Symbol.for('nutricoach.content.ResourceStore');
