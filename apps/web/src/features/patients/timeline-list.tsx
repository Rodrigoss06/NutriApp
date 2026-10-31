'use client';

import type { TimelineItem, TimelineResponse } from '@nutricoach/contracts';
import { DataTable } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import {
  CONDITION_KIND_LABELS,
  CONSENT_PURPOSE_LABELS,
  GOAL_KIND_LABELS,
  NOTE_VISIBILITY_LABELS,
  TIMELINE_KIND_LABELS,
} from './labels';

const label = <K extends string>(labels: Readonly<Record<K, string>>, value: string) =>
  (labels as Readonly<Record<string, string>>)[value] ?? value;

/** Qué pasó, en palabras: el código del alta, la finalidad, la revisión, la condición o la visibilidad de la nota. */
export function timelineDetail(item: TimelineItem): string {
  switch (item.kind) {
    case 'PATIENT_REGISTERED':
      return item.label;
    case 'CONSENT_GRANTED':
    case 'CONSENT_REVOKED':
      return label(CONSENT_PURPOSE_LABELS, item.label);
    case 'HISTORY_REVISED':
      return `Revisión ${item.label}`;
    case 'CONDITION_RECORDED':
      return `${label(CONDITION_KIND_LABELS, item.label)}: ${item.detail ?? ''}`;
    case 'GOAL_RECORDED':
      return label(GOAL_KIND_LABELS, item.label);
    case 'NOTE_WRITTEN':
      return `Visible para: ${label(NOTE_VISIBILITY_LABELS, item.label).toLowerCase()}`;
    case 'EVALUATION_CLOSED': {
      const level = label(EVALUATION_TIMELINE_LABELS, item.label);
      return item.detail ? `${level}, enmienda: ${item.detail}` : level;
    }
    case 'ENERGY_PRESCRIBED':
      return `Objetivo: ${label(ENERGY_GOAL_LABELS, item.label).toLowerCase()}`;
    case 'NUTRITION_PLAN_PUBLISHED':
    case 'TRAINING_PROGRAM_PUBLISHED':
      return `Versión ${item.label}`;
  }
}

/** Objetivo de la prescripción energética. */
const ENERGY_GOAL_LABELS = {
  LOSE_FAT: 'Perder grasa',
  GAIN_MUSCLE: 'Ganar músculo',
  MAINTAIN: 'Mantener',
  RECOMPOSITION: 'Recomposición corporal',
  PERFORMANCE: 'Rendimiento',
} as const;

/** Nivel de la evaluación cerrada; sin nivel, su tipo: bioimpedancia, postura o pruebas físicas. */
const EVALUATION_TIMELINE_LABELS = {
  BASIC: 'Nivel básico',
  ISAK1: 'ISAK 1',
  ISAK2: 'ISAK 2',
  BIA: 'Bioimpedancia',
  MOVEMENT: 'Evaluación postural',
  FITNESS: 'Pruebas físicas',
} as const;

/** Línea de tiempo del expediente (RF-10), de lo más reciente a lo más antiguo, por páginas. */
export function TimelineList({ patientId }: { patientId: string }) {
  const { timezone } = usePanelSession();
  const [cursor, setCursor] = useState<string | null>(null);
  const result = useQuery({
    queryKey: ['timeline', patientId, cursor],
    queryFn: () =>
      apiFetch<TimelineResponse>(
        `/patients/${patientId}/timeline?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
  });
  if (result.isPending) return <p className="text-muted-foreground">Cargando…</p>;
  if (result.isError)
    return <FormError error={result.error} title="No pudimos cargar la línea de tiempo" />;
  return (
    <DataTable<TimelineItem>
      caption="Línea de tiempo"
      rows={result.data.items}
      rowKey={(item) => `${item.kind}-${item.refId}`}
      nextCursor={result.data.nextCursor}
      onCursorChange={setCursor}
      empty={<p className="text-sm text-muted-foreground">Todavía no hay nada en el expediente.</p>}
      columns={[
        { key: 'when', header: 'Cuándo', cell: (item) => formatInstant(item.occurredAt, timezone) },
        { key: 'what', header: 'Qué', cell: (item) => TIMELINE_KIND_LABELS[item.kind] },
        { key: 'detail', header: 'Detalle', cell: timelineDetail },
      ]}
    />
  );
}
