'use client';

import type { DocumentStatusResponse, MySheetItem } from '@nutricoach/contracts';
import { apiFetch } from '@/lib/api/client';
import { SheetButton } from './download-sheet-button';

/** El rótulo de cada ficha de la app (ADR-095). */
export const MY_SHEET_LABELS = {
  PLAN: 'Mi plan de alimentación (PDF)',
  PROGRAM: 'Mi rutina (PDF)',
  RESULTS: 'Mis resultados de la última evaluación (PDF)',
  EVOLUTION: 'Mi evolución (PDF)',
} as const satisfies Record<MySheetItem, string>;

/**
 * Las fichas vigentes en la app (ADR-080, ADR-095): cada botón pide la suya por su nombre, con una Idempotency-Key nueva por toque
 * (06 §5); la API elige el origen y la descarga va con la sesión del paciente.
 */
export function MySheets({ items }: { items: readonly MySheetItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item}>
          <SheetButton
            label={MY_SHEET_LABELS[item]}
            size="touch"
            endpoints={{
              request: () =>
                apiFetch<DocumentStatusResponse | undefined>('/me/documents', {
                  method: 'POST',
                  body: { item },
                  headers: { 'Idempotency-Key': `sheet:${crypto.randomUUID()}` },
                }),
              status: () => apiFetch<DocumentStatusResponse>(`/me/documents/status?item=${item}`),
              fileUrl: (sheet) => `/api/v1/me/documents/${sheet.id}/file`,
            }}
          />
        </li>
      ))}
    </ul>
  );
}
