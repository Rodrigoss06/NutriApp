import type { MeApp, MeResources } from '@nutricoach/contracts';
import { EmptyState, Notice, StatusBadge } from '@nutricoach/ui';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RESOURCE_KIND_LABELS } from '@/features/resources/resource-view';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Material' };

/** Material (RF-30, ADR-094): lo que tu equipo te asignó, lo más nuevo primero, si la sección está a la vista. */
export default async function Page() {
  const [app, resources] = await Promise.all([
    serverApi<MeApp>('/me/app'),
    serverApi<MeResources>('/me/resources'),
  ]);
  if (!app.ok || !resources.ok) {
    return <Notice tone="danger" title="No pudimos cargar tu material" />;
  }
  if (!app.data.enabledSections.includes('RESOURCES')) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Material</h1>
        <EmptyState
          icon={BookOpen}
          title="Tu profesional no activó Material en tu app"
          description="Si quieres ver el material de tu equipo, pídeselo a tu profesional."
        />
      </div>
    );
  }
  const list = resources.data.resources;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Material</h1>
      {list.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Todavía no tienes material"
          description="Cuando tu equipo te asigne guías, artículos o videos, aparecen aquí."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Tu material">
          {list.map((resource) => (
            <li key={resource.id}>
              <Link
                href={`/mi/material/${resource.id}`}
                className="flex min-h-touch items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{resource.title}</span>
                  <span className="flex flex-wrap gap-2">
                    <StatusBadge tone="info">{RESOURCE_KIND_LABELS[resource.kind]}</StatusBadge>
                    {resource.viewedAt === null ? (
                      <StatusBadge tone="success">Nuevo</StatusBadge>
                    ) : null}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
