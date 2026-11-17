'use client';

import type { Features } from '@nutricoach/contracts';
import { cn } from '@nutricoach/ui';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import {
  activeSection,
  offered,
  RECORD_GROUPS,
  RECORD_SUMMARY,
  sectionLabel,
  type RecordSection,
} from './record-sections';

/**
 * La barra lateral del expediente (ADR-138): el Resumen y los seis grupos con todas sus secciones a la vista, con aria-current en
 * la activa, también en sus páginas internas (una evaluación, un plan, un programa). En pantallas de menos de 1280 px es un
 * selector: el botón dice la sección actual y abre la misma lista, que se cierra al elegir.
 */
export function RecordNav({
  patientId,
  features,
  patientLabel,
}: {
  patientId: string;
  /** Las banderas de la organización: lo apagado no se ofrece (ADR-127). */
  features: Features | null;
  patientLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const base = `/panel/pacientes/${patientId}`;
  const current = activeSection(pathname, patientId) ?? RECORD_SUMMARY;

  const item = (section: RecordSection) => {
    const active = section === current;
    return (
      <li key={section.path}>
        <Link
          href={`${base}${section.path}`}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex min-h-touch items-center rounded-md px-3 text-sm xl:min-h-8',
            active
              ? 'bg-surface font-semibold text-brand-text'
              : 'text-muted-foreground hover:bg-surface hover:text-foreground',
          )}
        >
          {sectionLabel(section, patientLabel)}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Secciones del expediente"
      // Al elegir una sección desde el selector, se cierra.
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
      }}
      className="flex flex-col gap-2 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="flex min-h-touch w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 text-left text-sm font-medium xl:hidden"
      >
        <span>
          <span className="text-muted-foreground">Sección: </span>
          {sectionLabel(current, patientLabel)}
        </span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0', open && 'rotate-180')} />
      </button>
      <div
        id={listId}
        className={cn(
          'flex-col gap-4 rounded-md border border-border bg-card p-2 xl:flex xl:border-0 xl:bg-transparent xl:p-0',
          open ? 'flex' : 'hidden',
        )}
      >
        <ul>{item(RECORD_SUMMARY)}</ul>
        {RECORD_GROUPS.map((group) => {
          const sections = group.sections.filter((section) => offered(section, features));
          if (sections.length === 0) return null;
          const groupId = `${listId}-${group.id}`;
          return (
            <div key={group.id} className="flex flex-col gap-1">
              <p
                id={groupId}
                className="px-3 font-label text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {group.label}
              </p>
              <ul aria-labelledby={groupId} className="flex flex-col">
                {sections.map(item)}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
