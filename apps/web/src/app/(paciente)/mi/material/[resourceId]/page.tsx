import type { MeResourceDetail } from '@nutricoach/contracts';
import { Button, Notice, StatusBadge } from '@nutricoach/ui';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleBody } from '@/features/resources/article-body';
import { MarkViewed } from '@/features/resources/mark-viewed';
import { RESOURCE_KIND_LABELS, resourceAction } from '@/features/resources/resource-view';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Material' };

/** Un recurso de tu equipo (RF-30): el artículo en pantalla; el enlace, el video o el PDF con su botón. Al abrirlo queda visto. */
export default async function Page({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const resource = await serverApi<MeResourceDetail>(
    `/me/resources/${encodeURIComponent(resourceId)}`,
  );
  if (!resource.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warning" title="Ese material ya no está disponible">
          Tu equipo pudo haberlo retirado.
        </Notice>
        <Link
          href="/mi/material"
          className="flex min-h-touch items-center text-brand-text underline"
        >
          Volver a tu material
        </Link>
      </div>
    );
  }
  const action = resourceAction(resource.data);
  return (
    <article className="flex flex-col gap-4">
      <MarkViewed resourceId={resource.data.id} />
      <Link
        href="/mi/material"
        className="flex min-h-touch items-center gap-2 self-start text-sm text-brand-text"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Tu material
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-balance">{resource.data.title}</h1>
        <StatusBadge tone="info" className="self-start">
          {RESOURCE_KIND_LABELS[resource.data.kind]}
        </StatusBadge>
      </header>
      {resource.data.bodyMarkdown ? <ArticleBody markdown={resource.data.bodyMarkdown} /> : null}
      {action ? (
        <Button asChild className="self-start">
          {action.external ? (
            <a href={action.href} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {action.label}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : (
            <a href={action.href} download>
              <Download aria-hidden />
              {action.label}
            </a>
          )}
        </Button>
      ) : null}
    </article>
  );
}
