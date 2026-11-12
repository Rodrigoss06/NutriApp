'use client';

import { whatsappLinkResponseSchema } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/problem';

/** Sin teléfono o sin su código de país (P-35): se corrige en la ficha del alumno. */
const PHONE_CODES = new Set(['NC-TRA-027', 'NC-TRA-028']);

/**
 * «Seguimiento asistido por WhatsApp» (P-35, respuesta de Jeremy del 2026-11-10; decisiones de Rodrigo del 2026-11-11): una línea
 * arriba del macrociclo, sin tocar la columna «Revisión», y un botón que abre el chat del alumno con un enlace wa.me. La app no envía
 * mensajes. La pestaña se abre al tocar, antes de pedir el enlace, para que el navegador no la bloquee.
 */
export function WhatsappFollowUp({ patientId }: { patientId: string }) {
  const open = useMutation({
    mutationFn: async (tab: Window | null) => {
      try {
        const { url } = whatsappLinkResponseSchema.parse(
          await apiFetch<unknown>(`/patients/${patientId}/athlete-profile/whatsapp`),
        );
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.location.assign(url);
        }
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
  });
  const phoneProblem = open.error instanceof ApiError && PHONE_CODES.has(open.error.code ?? '');
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle aria-hidden className="size-4 text-brand-text" />
          Seguimiento asistido por WhatsApp
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={open.isPending}
          onClick={() => {
            open.mutate(window.open('about:blank', '_blank'));
          }}
        >
          {open.isPending ? 'Abriendo…' : 'Abrir WhatsApp'}
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {open.isError ? (
          <>
            {errorMessage(open.error)}
            {phoneProblem ? (
              <>
                {' '}
                <Link href={`/panel/pacientes/${patientId}`} className="text-brand-text underline">
                  Ir a la ficha
                </Link>
              </>
            ) : null}
          </>
        ) : null}
      </p>
    </div>
  );
}
