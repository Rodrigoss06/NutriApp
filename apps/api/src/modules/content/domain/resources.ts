import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

/** Material educativo (RF-30, 05.3, ADR-094): la biblioteca de la organización, que el equipo asigna a sus pacientes. */
export type ResourceKind = 'FILE' | 'LINK' | 'VIDEO' | 'ARTICLE';
export type ResourceStatus = 'ACTIVE' | 'ARCHIVED';

export interface ResourceRecord {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly title: string;
  /** El PDF, en FILE. */
  readonly fileId: string | null;
  /** En LINK y VIDEO. */
  readonly url: string | null;
  /** En ARTICLE. */
  readonly bodyMarkdown: string | null;
  readonly tags: readonly string[];
  readonly status: ResourceStatus;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface ResourceInput {
  readonly title?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly url?: string | undefined;
  readonly bodyMarkdown?: string | undefined;
  readonly status?: ResourceStatus | undefined;
}

export type ResourceChanges = Partial<
  Pick<ResourceRecord, 'title' | 'tags' | 'url' | 'bodyMarkdown' | 'status'>
>;

export const RESOURCE_NOT_FOUND = domainError({
  code: 'NC-CON-003',
  message: 'Ese recurso no existe o no lo ves.',
});

export const RESOURCE_ARCHIVED = domainError({
  code: 'NC-CON-004',
  message: 'Ese recurso está archivado: restáuralo antes de cambiarlo o asignarlo.',
});

export const RESOURCE_FILE_UNSUPPORTED = domainError({
  code: 'NC-CON-005',
  message: 'Sube el material como un PDF de hasta 5 MB.',
});

export const RESOURCE_FIELD_MISMATCH = domainError({
  code: 'NC-CON-006',
  message:
    'Ese campo no corresponde al tipo del recurso: la URL va en un enlace o un video y el texto, en un artículo.',
});

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((tag, i) => tag === b[i]);

/**
 * Lo que cambia de un recurso, sin cambiar su tipo: la URL solo en un enlace o un video, el texto solo en un artículo, y un PDF no
 * cambia su archivo (se sube otro). Uno archivado solo se restaura. Devuelve solo los campos que de verdad cambian.
 */
export function resourceChanges(
  current: ResourceRecord,
  input: ResourceInput,
): Result<ResourceChanges, DomainError> {
  const takesUrl = current.kind === 'LINK' || current.kind === 'VIDEO';
  if (input.url !== undefined && !takesUrl) return err(RESOURCE_FIELD_MISMATCH);
  if (input.bodyMarkdown !== undefined && current.kind !== 'ARTICLE') {
    return err(RESOURCE_FIELD_MISMATCH);
  }
  const changes: { -readonly [K in keyof ResourceChanges]: ResourceChanges[K] } = {};
  if (input.title !== undefined && input.title !== current.title) changes.title = input.title;
  if (input.tags !== undefined && !sameTags(input.tags, current.tags)) changes.tags = input.tags;
  if (input.url !== undefined && input.url !== current.url) changes.url = input.url;
  if (input.bodyMarkdown !== undefined && input.bodyMarkdown !== current.bodyMarkdown) {
    changes.bodyMarkdown = input.bodyMarkdown;
  }
  if (input.status !== undefined && input.status !== current.status) changes.status = input.status;
  const editsContent = Object.keys(changes).some((field) => field !== 'status');
  if (current.status === 'ARCHIVED' && editsContent) return err(RESOURCE_ARCHIVED);
  return ok(changes);
}
