import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically, FileRegistry, MAX_UPLOAD_BYTES } from '../../../platform/index.js';
import { ClinicalApi } from '../../clinical/index.js';
import {
  RESOURCE_ARCHIVED,
  RESOURCE_FILE_UNSUPPORTED,
  RESOURCE_NOT_FOUND,
  resourceChanges,
  type ResourceInput,
  type ResourceRecord,
} from '../domain/resources.js';
import { contentEvent, type ContentEventType } from './content-events.js';
import { RESOURCE_STORE, type ResourceStore } from './ports/resources.ports.js';

/** Un enlace, un video o un artículo nuevo. */
export type NewResource =
  | {
      readonly kind: 'LINK' | 'VIDEO';
      readonly title: string;
      readonly url: string;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: 'ARTICLE';
      readonly title: string;
      readonly bodyMarkdown: string;
      readonly tags: readonly string[];
    };

const FIELDS = {
  title: 'title',
  tags: 'tags',
  url: 'url',
  bodyMarkdown: 'body_markdown',
  status: 'status',
} as const;

/**
 * Material educativo (RF-30, ADR-094): la biblioteca de la organización la escribe cualquier profesional (permiso de catálogo en la
 * ruta); asignar o quitar un recurso exige acceso de escritura al paciente (RN-A05). El paciente solo marca lo que abrió. Cada cambio
 * deja su evento para la auditoría (RN-B03).
 */
@Injectable()
export class ResourceCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(RESOURCE_STORE) private readonly store: ResourceStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
  ) {}

  create(
    context: SecurityContext,
    input: NewResource,
  ): Promise<Result<ResourceRecord, DomainError>> {
    return atomically(this.uow, context, () =>
      this.#insert(context, {
        kind: input.kind,
        title: input.title,
        tags: input.tags,
        fileId: null,
        url: input.kind === 'ARTICLE' ? null : input.url,
        bodyMarkdown: input.kind === 'ARTICLE' ? input.bodyMarkdown : null,
      }),
    );
  }

  /**
   * Un PDF de hasta 5 MB (ADR-038): el tipo sale de los bytes; se escriben antes de la transacción y se descartan si esta falla.
   */
  async upload(
    context: SecurityContext,
    input: { readonly title: string; readonly tags: readonly string[] },
    content: Uint8Array,
  ): Promise<Result<ResourceRecord, DomainError>> {
    const organizationId = organizationOf(context);
    if (content.byteLength === 0 || content.byteLength > MAX_UPLOAD_BYTES) {
      return err(RESOURCE_FILE_UNSUPPORTED);
    }
    const file = await this.files.write(organizationId, content);
    if (file?.mimeType !== 'application/pdf') {
      if (file) await this.files.discard(file.key);
      return err(RESOURCE_FILE_UNSUPPORTED);
    }
    try {
      const result = await atomically(this.uow, context, async () => {
        await this.files.register({
          ...file,
          sizeBytes: content.byteLength,
          organizationId,
          purpose: 'EDUCATIONAL_RESOURCE',
          uploadedBy: context.userId,
        });
        return this.#insert(context, {
          kind: 'FILE',
          title: input.title,
          tags: input.tags,
          fileId: file.id,
          url: null,
          bodyMarkdown: null,
        });
      });
      if (!result.ok) await this.files.discard(file.key);
      return result;
    } catch (failure) {
      await this.files.discard(file.key);
      throw failure;
    }
  }

  update(
    context: SecurityContext,
    resourceId: string,
    input: ResourceInput,
  ): Promise<Result<ResourceRecord, DomainError>> {
    return atomically(this.uow, context, async () => {
      const current = await this.store.find(resourceId);
      if (!current) return err(RESOURCE_NOT_FOUND);
      const changes = resourceChanges(current, input);
      if (!changes.ok) return changes;
      const fields = (Object.keys(changes.value) as (keyof typeof FIELDS)[]).map(
        (key) => FIELDS[key],
      );
      if (fields.length === 0) return ok(current);
      await this.store.update(resourceId, changes.value);
      await this.#emit(context, 'content.resource.updated', resourceId, {
        patientId: null,
        fields,
      });
      return ok({ ...current, ...changes.value });
    });
  }

  /** Repetirlo no duplica ni deja otro evento. */
  assign(
    context: SecurityContext,
    patientId: string,
    resourceId: string,
  ): Promise<Result<void, DomainError>> {
    const organizationId = organizationOf(context);
    return atomically(this.uow, context, async () => {
      const writable = await this.clinical.ensurePatientWritable(context, patientId);
      if (!writable.ok) return writable;
      const resource = await this.store.find(resourceId);
      if (!resource) return err(RESOURCE_NOT_FOUND);
      if (resource.status === 'ARCHIVED') return err(RESOURCE_ARCHIVED);
      const assigned = await this.store.assign({
        resourceId,
        patientId,
        organizationId,
        assignedBy: actorOf(context),
        assignedAt: this.clock.now(),
      });
      if (assigned) {
        await this.#emit(context, 'content.resource.assigned', resourceId, { patientId });
      }
      return ok(undefined);
    });
  }

  unassign(
    context: SecurityContext,
    patientId: string,
    resourceId: string,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const writable = await this.clinical.ensurePatientWritable(context, patientId);
      if (!writable.ok) return writable;
      if (!(await this.store.unassign(resourceId, patientId))) return err(RESOURCE_NOT_FOUND);
      await this.#emit(context, 'content.resource.unassigned', resourceId, { patientId });
      return ok(undefined);
    });
  }

  /** El paciente abrió un recurso suyo y vigente (ADR-086): la primera vez queda la hora; después, nada cambia. */
  markViewed(context: SecurityContext, resourceId: string): Promise<Result<void, DomainError>> {
    const patientId = context.patientId;
    return atomically(this.uow, context, async () => {
      if (!patientId) return err(RESOURCE_NOT_FOUND);
      const assignment = await this.store.assignment(resourceId, patientId);
      if (!assignment || assignment.resource.status !== 'ACTIVE') return err(RESOURCE_NOT_FOUND);
      if (await this.store.markViewed(resourceId)) {
        await this.#emit(context, 'content.resource.viewed', resourceId, {
          patientId,
          fields: ['viewed_at'],
        });
      }
      return ok(undefined);
    });
  }

  async #insert(
    context: SecurityContext,
    values: Pick<ResourceRecord, 'kind' | 'title' | 'tags' | 'fileId' | 'url' | 'bodyMarkdown'>,
  ): Promise<Result<ResourceRecord, DomainError>> {
    const record: ResourceRecord = {
      ...values,
      id: this.ids.newId<'EducationalResourceId'>(),
      status: 'ACTIVE',
      createdBy: actorOf(context),
      createdAt: this.clock.now(),
    };
    await this.store.insert({ ...record, organizationId: organizationOf(context) });
    await this.#emit(context, 'content.resource.created', record.id, { patientId: null });
    return ok(record);
  }

  async #emit(
    context: SecurityContext,
    type: ContentEventType,
    aggregateId: string,
    payload: { readonly patientId: string | null; readonly fields?: readonly string[] },
  ): Promise<void> {
    await this.outbox.append(
      [
        contentEvent(type, organizationOf(context), aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

function organizationOf(context: SecurityContext): OrganizationId {
  if (!context.organizationId) throw new Error('content necesita la organización activa.');
  return context.organizationId;
}

function actorOf(context: SecurityContext): string {
  if (!context.userId) throw new Error('content necesita el usuario.');
  return context.userId;
}
