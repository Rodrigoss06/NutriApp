import type { RecordDocument } from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import { Download, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatInstant } from '@/lib/dates';
import {
  documentFileUrl,
  fileSummary,
  linkHost,
  STATUS_TONES,
  statusLabel,
  type DocumentAudience,
} from './record-documents-view';

/** El enlace o el archivo de un documento; los dos se abren fuera de la página y el archivo, siempre por la API. */
function DocumentContentLink({
  document,
  audience,
}: {
  document: RecordDocument;
  audience: DocumentAudience;
}) {
  const { content } = document;
  if (!content) {
    return <p className="text-sm text-muted-foreground">Todavía sin archivo ni enlace.</p>;
  }
  if (content.kind === 'LINK') {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-touch items-center gap-1 text-brand-text underline"
        >
          <ExternalLink aria-hidden className="size-4" />
          Abrir el enlace<span className="sr-only"> de «{document.title}», en otra pestaña</span>
        </a>
        <span className="text-muted-foreground">{linkHost(content.url)}</span>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <a
        href={documentFileUrl(document.id, audience)}
        download
        className="inline-flex min-h-touch items-center gap-1 text-brand-text underline"
      >
        <Download aria-hidden className="size-4" />
        Descargar<span className="sr-only"> «{document.title}»</span>
      </a>
      <span className="text-muted-foreground">
        {fileSummary(content.mimeType, content.sizeBytes)}
      </span>
    </p>
  );
}

/** Quién puso el contenido y, en el panel, cuándo; un pedido sin contenido dice cuándo se pidió. */
function whenOf(document: RecordDocument, by: string | null, timezone: string | null): string {
  if (by && document.contentAt) {
    return timezone ? `${by} el ${formatInstant(document.contentAt, timezone)}` : `${by}.`;
  }
  return timezone
    ? `Pedido el ${formatInstant(document.createdAt, timezone)}`
    : 'Lo pidió tu coach.';
}

/**
 * Un documento del expediente (RN-G21): su título, su estado (color, ícono y texto), su archivo o enlace, la nota del coach si lo
 * devolvió y quién puso el contenido. Las acciones van debajo.
 */
export function DocumentItem({
  document,
  audience,
  timezone,
  categoryLabel,
  children,
}: {
  document: RecordDocument;
  audience: DocumentAudience;
  /** La zona de la organización, en el panel; en la app no se muestra la hora. */
  timezone: string | null;
  /** En una lista sin grupos por categoría, la categoría va junto al título. */
  categoryLabel?: string;
  children?: ReactNode;
}) {
  const by =
    document.contentByRole === null
      ? null
      : document.contentByRole === 'PATIENT'
        ? audience === 'patient'
          ? 'Lo subiste tú'
          : 'Lo subió desde su app'
        : audience === 'patient'
          ? 'Lo agregó tu coach'
          : 'Lo agregó el equipo';
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">{document.title}</h4>
        <StatusBadge tone={STATUS_TONES[document.status]}>
          {statusLabel(document.status)}
        </StatusBadge>
        {categoryLabel ? (
          <span className="text-sm text-muted-foreground">{categoryLabel}</span>
        ) : null}
      </div>
      <DocumentContentLink document={document} audience={audience} />
      {document.reviewNote ? (
        <p className="rounded-md bg-warning-surface p-2 text-sm text-warning">
          {audience === 'patient' ? 'Tu coach pidió un cambio: ' : 'Nota al devolverlo: '}
          <span className="text-foreground">{document.reviewNote}</span>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{whenOf(document, by, timezone)}</p>
      {children}
    </li>
  );
}
