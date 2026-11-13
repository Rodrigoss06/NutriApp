import type {
  RecordDocumentCategory,
  RecordDocumentChanged,
  ReviewRecordDocument,
} from '@nutricoach/contracts';
import { apiFetch, apiUpload } from '@/lib/api/client';

/** El contenido que se sube: un archivo ya preparado o un enlace https. */
export type DocumentContent =
  | { readonly kind: 'FILE'; readonly file: Blob; readonly name: string }
  | { readonly kind: 'LINK'; readonly url: string };

export interface DocumentInput {
  readonly title: string;
  readonly category: RecordDocumentCategory;
}

/** Cabeceras de cada escritura: el alumno manda una Idempotency-Key nueva por acción (06 §5); el equipo, ninguna. */
export type ActionHeaders = Readonly<Record<string, string>>;

/** Agregar: sin contenido, un pedido (en JSON); con enlace, en JSON; con archivo, en multipart con el campo «file». */
export function addDocument(
  path: string,
  input: DocumentInput,
  content: DocumentContent | null,
  headers: ActionHeaders = {},
): Promise<RecordDocumentChanged> {
  if (content?.kind === 'FILE') {
    const form = new FormData();
    form.append('title', input.title);
    form.append('category', input.category);
    form.append('file', content.file, content.name);
    return apiUpload<RecordDocumentChanged>(path, form, 'POST', headers);
  }
  return apiFetch<RecordDocumentChanged>(path, {
    method: 'POST',
    body: content ? { ...input, linkUrl: content.url } : input,
    headers,
  });
}

/** Reemplazar el contenido con la versión que se vio (If-Match): el anterior se borra. */
export function replaceDocumentContent(
  path: string,
  version: number,
  content: DocumentContent,
  headers: ActionHeaders = {},
): Promise<RecordDocumentChanged> {
  const withVersion = { ...headers, 'If-Match': String(version) };
  if (content.kind === 'FILE') {
    const form = new FormData();
    form.append('file', content.file, content.name);
    return apiUpload<RecordDocumentChanged>(path, form, 'PUT', withVersion);
  }
  return apiFetch<RecordDocumentChanged>(path, {
    method: 'PUT',
    body: { linkUrl: content.url },
    headers: withVersion,
  });
}

/** El coach valida o devuelve con una nota lo que está por revisar. */
export function reviewDocument(
  id: string,
  version: number,
  review: ReviewRecordDocument,
): Promise<RecordDocumentChanged> {
  return apiFetch<RecordDocumentChanged>(`/record-documents/${id}/review`, {
    method: 'PUT',
    body: review,
    headers: { 'If-Match': String(version) },
  });
}

export function deleteDocument(
  path: string,
  version: number,
  headers: ActionHeaders = {},
): Promise<void> {
  return apiFetch<undefined>(path, {
    method: 'DELETE',
    headers: { ...headers, 'If-Match': String(version) },
  });
}
