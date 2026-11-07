import type { ResourceKind } from '@nutricoach/contracts';

/** Los tipos de material (RF-30, ADR-094). */
export const RESOURCE_KIND_LABELS = {
  LINK: 'Enlace',
  VIDEO: 'Video',
  ARTICLE: 'Artículo',
  FILE: 'PDF',
} as const satisfies Record<ResourceKind, string>;

/** Un bloque del artículo: el texto nunca se interpreta como HTML; React lo escapa. */
export type ArticleBlock =
  | { readonly type: 'heading'; readonly level: 2 | 3; readonly text: string }
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'list'; readonly items: readonly string[] };

const HEADING = /^(#{1,3})\s+(.+)$/;
const ITEM = /^[-*]\s+(.+)$/;

/**
 * El formato simple de un artículo: «#», «##» o «###» al inicio son títulos (el h1 es el del recurso), «-» o «*» son una lista, y
 * las demás líneas seguidas forman un párrafo. Nada más: ni enlaces ni HTML.
 */
export function articleBlocks(markdown: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    if (list.length > 0) blocks.push({ type: 'list', items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    const item = ITEM.exec(line);
    if (line === '') {
      flush();
    } else if (heading?.[1] && heading[2]) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length === 1 ? 2 : 3, text: heading[2] });
    } else if (item?.[1]) {
      if (paragraph.length > 0) flush();
      list.push(item[1]);
    } else {
      if (list.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** **negrita** dentro de una línea; un par sin cerrar queda como texto. */
export function inlineParts(text: string): { text: string; strong: boolean }[] {
  const pieces = text.split('**');
  if (pieces.length % 2 === 0) return [{ text, strong: false }];
  return pieces
    .map((piece, i) => ({ text: piece, strong: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}

/** Lo que hace el botón de un recurso en la app: el enlace y el video se abren afuera; el PDF se descarga por la API. */
export function resourceAction(resource: {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly url: string | null;
}): { label: string; href: string; external: boolean } | null {
  switch (resource.kind) {
    case 'LINK':
      return resource.url ? { label: 'Abrir el enlace', href: resource.url, external: true } : null;
    case 'VIDEO':
      return resource.url ? { label: 'Ver el video', href: resource.url, external: true } : null;
    case 'FILE':
      return {
        label: 'Descargar el PDF',
        href: `/api/v1/me/resources/${resource.id}/file`,
        external: false,
      };
    default:
      return null;
  }
}
