import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type DomainError,
  type Id,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../platform/index.js';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../clinical/index.js';
import {
  RESOURCE_NOT_FOUND,
  type ResourceRecord,
  type ResourceStatus,
} from '../domain/resources.js';
import {
  RESOURCE_STORE,
  type AssignmentView,
  type ResourceStore,
  type ResourceSummary,
} from './ports/resources.ports.js';

/** Un recurso asignado, con el texto del artículo: lo que el paciente abre en su app. */
export interface AssignedDetail extends AssignmentView {
  readonly bodyMarkdown: string | null;
}

/**
 * Lecturas del material educativo (RF-30, ADR-094): la biblioteca y lo asignado a un paciente para su equipo (RN-A05), y lo vigente
 * para el paciente en su app. Un PDF se descarga solo por la API, como adjunto y auditado (ADR-038, RN-B03).
 */
@Injectable()
export class ResourceQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(RESOURCE_STORE) private readonly store: ResourceStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  library(
    context: SecurityContext,
    status: ResourceStatus | null,
  ): Promise<readonly ResourceSummary[]> {
    return this.uow.query(context, () => this.store.library(status));
  }

  /** El recurso con el texto del artículo y cuántos de tus pacientes lo tienen. */
  async detail(
    context: SecurityContext,
    resourceId: string,
  ): Promise<Result<ResourceRecord & { readonly assignedCount: number }, DomainError>> {
    return this.uow.query(context, async () => {
      const resource = await this.store.find(resourceId);
      if (!resource) return err(RESOURCE_NOT_FOUND);
      const summary = (await this.store.library(null)).find((item) => item.id === resourceId);
      return ok({ ...resource, assignedCount: summary?.assignedCount ?? 0 });
    });
  }

  /** Lo asignado al paciente, también lo archivado: su equipo ve qué abrió (viewed_at). */
  async ofPatient(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<readonly AssignmentView[], DomainError>> {
    return this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return err(PATIENT_NOT_FOUND);
      return ok(await this.store.assignments(patientId, false));
    });
  }

  /** En la app: lo vigente que su equipo le asignó. */
  mine(context: SecurityContext): Promise<readonly AssignmentView[]> {
    const patientId = patientOf(context);
    return this.uow.query(context, () => this.store.assignments(patientId, true));
  }

  /** En la app: un recurso suyo y vigente, con su texto si es un artículo. */
  async mineDetail(
    context: SecurityContext,
    resourceId: string,
  ): Promise<Result<AssignedDetail, DomainError>> {
    const patientId = patientOf(context);
    return this.uow.query(context, async () => {
      const assignment = await this.store.assignment(resourceId, patientId);
      if (!assignment || assignment.resource.status !== 'ACTIVE') return err(RESOURCE_NOT_FOUND);
      const resource = await this.store.find(resourceId);
      return ok({ ...assignment, bodyMarkdown: resource?.bodyMarkdown ?? null });
    });
  }

  /**
   * El PDF de un recurso: el equipo, desde la biblioteca; el paciente, solo si lo tiene asignado y vigente (su RLS lo exige también
   * en platform.file_object). Auditado como exportación.
   */
  async file(
    context: SecurityContext,
    resourceId: string,
  ): Promise<{ readonly content: Buffer; readonly fileName: string } | null> {
    const found = await this.uow.query(context, async () => {
      const resource = await this.store.find(resourceId);
      if (!resource?.fileId) return null;
      if (context.role === 'PATIENT') {
        const assignment = await this.store.assignment(resourceId, patientOf(context));
        if (!assignment || resource.status !== 'ACTIVE') return null;
      }
      const file = await this.files.read(resource.fileId);
      return file ? { resource, file } : null;
    });
    if (!found) return null;
    await this.audit.record(context, {
      action: 'EXPORT',
      resourceType: 'content.educational_resource',
      resourceId: found.resource.id as Id<string>,
      ...(context.patientId ? { patientId: context.patientId } : {}),
    });
    return { content: found.file.content, fileName: 'material.pdf' };
  }
}

function patientOf(context: SecurityContext): string {
  if (!context.patientId) throw new Error('Una lectura de la app necesita la sesión del paciente.');
  return context.patientId;
}
