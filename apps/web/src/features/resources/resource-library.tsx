'use client';

import type {
  CreateResource,
  Resource,
  ResourceDetail,
  ResourceKind,
  ResourceList,
} from '@nutricoach/contracts';
import { Button, EmptyState, Notice, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { pluralLabel } from '@/features/organization/labels';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch, apiUpload } from '@/lib/api/client';
import { formatDate } from '@/lib/dates';
import { RESOURCE_KIND_LABELS } from './resource-view';

export const RESOURCES_KEY = ['resources'] as const;

const KIND_OPTIONS = (['LINK', 'VIDEO', 'ARTICLE', 'FILE'] as const).map((kind) => ({
  value: kind,
  label: RESOURCE_KIND_LABELS[kind],
}));

const tagsOf = (value: string): string[] =>
  value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

/** El formulario de un recurso nuevo: el contenido cambia con el tipo. */
function NewResourceForm() {
  const client = useQueryClient();
  const [kind, setKind] = useState<ResourceKind>('LINK');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  // El campo de archivo no se controla: cambiar su clave lo vacía después de agregar.
  const [fileKey, setFileKey] = useState(0);
  const reset = () => {
    setTitle('');
    setUrl('');
    setBody('');
    setTags('');
    setFile(null);
    setFileKey((key) => key + 1);
  };
  const create = useMutation({
    mutationFn: async (): Promise<ResourceDetail> => {
      if (kind === 'FILE') {
        const form = new FormData();
        form.append('title', title);
        form.append('tags', tagsOf(tags).join(','));
        if (file) form.append('file', file);
        return apiUpload<ResourceDetail>('/resources/file', form);
      }
      const input: CreateResource =
        kind === 'ARTICLE'
          ? { kind, title, bodyMarkdown: body, tags: tagsOf(tags) }
          : { kind, title, url, tags: tagsOf(tags) };
      return apiFetch<ResourceDetail>('/resources', { method: 'POST', body: input });
    },
    onSuccess: async () => {
      reset();
      await client.invalidateQueries({ queryKey: RESOURCES_KEY });
    },
  });
  const ready =
    title.trim() !== '' &&
    (kind === 'ARTICLE' ? body.trim() !== '' : kind === 'FILE' ? file !== null : url.trim() !== '');
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-lg font-semibold">Agregar material</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Tipo"
          options={KIND_OPTIONS}
          value={kind}
          onValueChange={(value) => {
            setKind(value as ResourceKind);
          }}
        />
        <TextField
          label="Título"
          value={title}
          maxLength={120}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </div>
      {kind === 'LINK' || kind === 'VIDEO' ? (
        <TextField
          label={kind === 'VIDEO' ? 'Dirección del video' : 'Dirección del enlace'}
          hint="Empieza con https://. El paciente lo abre desde su app."
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
        />
      ) : null}
      {kind === 'ARTICLE' ? (
        <TextAreaField
          label="Texto"
          hint="Formato simple: «# » para un título, «- » para una lista y **negrita**. Hasta 20 000 caracteres."
          rows={8}
          maxLength={20_000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      ) : null}
      {kind === 'FILE' ? (
        <TextField
          key={fileKey}
          label="Archivo PDF"
          hint="Hasta 5 MB."
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
        />
      ) : null}
      <TextField
        label="Etiquetas (opcional)"
        hint="Separadas por coma, por ejemplo: hidratación, cena."
        value={tags}
        onChange={(event) => {
          setTags(event.target.value);
        }}
      />
      <FormError error={create.error} title="No se agregó el material" />
      <Button type="submit" className="self-start" disabled={create.isPending || !ready}>
        Agregar a la biblioteca
      </Button>
    </form>
  );
}

function ResourceRow({ resource, canWrite }: { resource: Resource; canWrite: boolean }) {
  const client = useQueryClient();
  const { patientLabel } = usePanelSession();
  const toggle = useMutation({
    mutationFn: () =>
      apiFetch<ResourceDetail>(`/resources/${resource.id}`, {
        method: 'PATCH',
        body: { status: resource.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: RESOURCES_KEY });
    },
  });
  const archived = resource.status === 'ARCHIVED';
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{resource.title}</span>
          <StatusBadge tone="info">{RESOURCE_KIND_LABELS[resource.kind]}</StatusBadge>
          {archived ? <StatusBadge tone="warning">Archivado</StatusBadge> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          Agregado el {formatDate(resource.createdAt.slice(0, 10))} · asignado a{' '}
          <span className="tabular-nums">{String(resource.assignedCount)}</span>{' '}
          {(resource.assignedCount === 1 ? patientLabel : pluralLabel(patientLabel)).toLowerCase()}
          {resource.tags.length > 0 ? ` · ${resource.tags.join(', ')}` : ''}
        </p>
        <FormError error={toggle.error} title="No se guardó el cambio" />
      </div>
      <div className="flex flex-wrap gap-2">
        {resource.kind === 'FILE' ? (
          <Button asChild variant="secondary">
            <a href={`/api/v1/resources/${resource.id}/file`} download>
              Descargar PDF
            </a>
          </Button>
        ) : resource.url ? (
          <Button asChild variant="secondary">
            <a href={resource.url} target="_blank" rel="noopener noreferrer">
              Abrir
              <span className="sr-only"> {resource.title} (se abre en otra pestaña)</span>
            </a>
          </Button>
        ) : null}
        {canWrite ? (
          <Button
            variant="secondary"
            disabled={toggle.isPending}
            onClick={() => {
              toggle.mutate();
            }}
          >
            {archived ? 'Restaurar' : 'Archivar'}
            <span className="sr-only"> {resource.title}</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * La biblioteca de material de la organización (RF-30, ADR-094): enlaces, videos, artículos y PDF que cualquier profesional agrega y
 * asigna a sus pacientes desde la app de cada uno. Archivar lo quita de la biblioteca y de la app sin borrar nada.
 */
export function ResourceLibrary() {
  const canWrite = useCanWrite();
  const list = useQuery({
    queryKey: RESOURCES_KEY,
    queryFn: () => apiFetch<ResourceList>('/resources'),
  });
  return (
    <div className="flex flex-col gap-6">
      {canWrite ? <NewResourceForm /> : null}
      {list.isError ? (
        <Notice tone="danger" title="No pudimos cargar la biblioteca de material" />
      ) : null}
      {list.data?.resources.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Todavía no hay material"
          description="Agrega un enlace, un video, un artículo o un PDF para asignarlo desde la app de cada uno."
        />
      ) : null}
      {list.data && list.data.resources.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label="Material de la organización">
          {list.data.resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} canWrite={canWrite} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
