'use client';

import type {
  DocumentSource,
  DocumentStatusResponse,
  GeneratedDocument,
} from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { readySheet, SheetTimeout, statusQuery } from './sheet-request';

/** Espera `ms`, o corta si la pantalla se cerró. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('La pantalla se cerró.'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('La pantalla se cerró.'));
      },
      { once: true },
    );
  });

/** La descarga como adjunto, por la API: el navegador la guarda con su nombre (ADR-038). */
function saveFile(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}

/** Lo que necesita un botón de ficha: cómo pedirla, cómo saber si ya está y desde dónde se descarga. */
export interface SheetEndpoints {
  readonly request: () => Promise<DocumentStatusResponse | undefined>;
  readonly status: () => Promise<DocumentStatusResponse>;
  readonly fileUrl: (sheet: GeneratedDocument) => string;
}

/**
 * Un botón que descarga una ficha (RF-24): si el worker la está generando, «Generando…» hasta que esté. Lo usan el panel y la app
 * del paciente, cada uno con sus rutas.
 */
export function SheetButton({
  label,
  endpoints,
  size = 'md',
}: {
  label: string;
  endpoints: SheetEndpoints;
  /** touch en la app del paciente: 44 px (06 §8). */
  size?: 'md' | 'touch';
}) {
  const closed = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    closed.current = controller;
    return () => {
      controller.abort();
    };
  }, []);
  const download = useMutation({
    mutationFn: () =>
      readySheet({
        request: endpoints.request,
        status: endpoints.status,
        wait: (ms) => pause(ms, closed.current.signal),
        now: () => Date.now(),
      }),
    onSuccess: (sheet) => {
      saveFile(endpoints.fileUrl(sheet), sheet.fileName);
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          size={size}
          disabled={download.isPending}
          onClick={() => {
            download.mutate();
          }}
        >
          <Download aria-hidden />
          {download.isPending ? 'Generando…' : label}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {download.isPending ? 'Generando la ficha en PDF…' : ''}
      </p>
      {download.error instanceof SheetTimeout ? (
        <Notice tone="warning" title="La ficha está tardando más de lo normal">
          Se sigue generando. Vuelve a intentarlo en un momento.
        </Notice>
      ) : (
        <FormError error={download.error} title="No se descargó la ficha" />
      )}
    </div>
  );
}

/**
 * «Descargar ficha (PDF)» (RF-24): la del plan publicado o reemplazado, o la de la evaluación cerrada con resultados.
 * Exportar vale también en solo lectura (RN-A02), y cada descarga queda auditada (RN-B03).
 */
export function DownloadSheetButton({
  patientId,
  source,
  label = 'Descargar ficha (PDF)',
}: {
  patientId: string;
  source: DocumentSource;
  /** El rótulo del botón, si la página tiene más de una ficha: «Descargar ficha de evolución (PDF)». */
  label?: string;
}) {
  return (
    <SheetButton
      label={label}
      endpoints={{
        request: () =>
          apiFetch<DocumentStatusResponse | undefined>(`/patients/${patientId}/documents`, {
            method: 'POST',
            body: source,
          }),
        status: () =>
          apiFetch<DocumentStatusResponse>(
            `/patients/${patientId}/documents/status?${statusQuery(source)}`,
          ),
        fileUrl: (sheet) => `/api/v1/documents/${sheet.id}/file`,
      }}
    />
  );
}
