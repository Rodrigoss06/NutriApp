'use client';

import type { MeConsents } from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice } from '@nutricoach/ui';
import { FormError } from '@/features/forms/form-error';
import { ConsentText } from '@/features/patients/consent-text';
import { newActionKey, useMeAction } from './records';

type SelfConsent = MeConsents['consents'][number];

/**
 * Autorizar o retirar el seguimiento del ciclo menstrual desde la app (RN-G17, 07 §2): con el texto vigente, que el paciente lee
 * antes de autorizar. Sin la autorización, el registro diario no pide los síntomas del ciclo y la API los rechaza. Retirarla no
 * borra lo ya registrado (RN-B02).
 */
export function MenstrualConsent({ consent }: { consent: SelfConsent | undefined }) {
  const grant = useMeAction<{ id: string }>('/me/consents');
  const revoke = useMeAction<undefined>('/me/consents/MENSTRUAL_TRACKING/revoke');
  const pending = grant.isPending || revoke.isPending;

  if (consent?.active) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="success" title="Lo autorizaste">
          En tu registro diario puedes anotar los síntomas de tu ciclo. Lo ve solo tu equipo de
          atención y no cambia tu plan sin que tu coach lo decida.
        </Notice>
        <FormError error={revoke.error} title="No se retiró la autorización" />
        <ConfirmDialog
          trigger={
            <Button variant="secondary" size="touch" disabled={pending}>
              Retirar la autorización
            </Button>
          }
          title="¿Retirar la autorización del seguimiento del ciclo?"
          description="Ya no podrás anotar los síntomas de tu ciclo. Lo que ya registraste se conserva hasta que pidas su supresión."
          confirmLabel="Retirar"
          tone="danger"
          onConfirm={() => {
            grant.reset();
            revoke.mutate({ key: newActionKey() });
          }}
        />
      </div>
    );
  }

  if (!consent?.document) {
    return (
      <p className="text-sm text-muted-foreground">
        Por ahora no hay un texto vigente para autorizarlo. Consulta a tu profesional.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Si lo autorizas, en tu registro diario podrás anotar los síntomas de tu ciclo, de 0 a 3. Tu
        coach lo tendrá como contexto al revisar tu recuperación.
      </p>
      {/* Una región con desplazamiento se enfoca con el teclado (WCAG 2.1.1). */}
      <div
        role="region"
        aria-label="Texto de la autorización"
        tabIndex={0}
        className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted p-3"
      >
        <ConsentText markdown={consent.document.bodyMarkdown} />
        <p className="mt-2 text-xs text-muted-foreground">Versión {consent.document.version}</p>
      </div>
      <FormError error={grant.error} title="No se registró la autorización" />
      <Button
        size="touch"
        disabled={pending}
        onClick={() => {
          revoke.reset();
          grant.mutate({ body: { purpose: 'MENSTRUAL_TRACKING' }, key: newActionKey() });
        }}
      >
        {grant.isPending ? 'Autorizando…' : 'Autorizar el seguimiento del ciclo'}
      </Button>
    </div>
  );
}
