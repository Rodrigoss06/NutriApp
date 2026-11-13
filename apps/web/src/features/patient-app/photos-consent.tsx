'use client';

import type { MeConsents } from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice } from '@nutricoach/ui';
import { FormError } from '@/features/forms/form-error';
import { ConsentText } from '@/features/patients/consent-text';
import { newActionKey, useMeAction } from './records';

type SelfConsent = MeConsents['consents'][number];

/**
 * Autorizar o retirar las fotos de progreso desde la app (RN-G20, P-30): con el texto del abogado, que el paciente lee antes de
 * autorizar. Retirarla borra sus fotos en el acto, sin días de gracia. Si la organización tiene las fotos apagadas (`paused`,
 * ADR-128), solo se puede retirar.
 */
export function PhotosConsent({
  consent,
  paused = false,
}: {
  consent: SelfConsent | undefined;
  paused?: boolean;
}) {
  const grant = useMeAction<{ id: string }>('/me/consents');
  const revoke = useMeAction<undefined>('/me/consents/PROGRESS_PHOTOS/revoke');
  const pending = grant.isPending || revoke.isPending;

  if (consent?.active) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="success" title="Lo autorizaste">
          {paused
            ? 'Tu organización pausó las fotos de progreso: por ahora nadie las sube ni las ve. Las que ya subiste se guardan hasta que retires la autorización.'
            : 'Tus fotos las ve solo tu equipo de atención, para seguir tu evolución.'}
        </Notice>
        <FormError error={revoke.error} title="No se retiró la autorización" />
        <div>
          <ConfirmDialog
            trigger={
              <Button variant="secondary" size="touch" disabled={pending}>
                Retirar la autorización
              </Button>
            }
            title="¿Retirar la autorización de tus fotos?"
            description="Tus fotos de progreso se borran ahora y no se pueden recuperar."
            confirmLabel="Retirar y borrar"
            tone="danger"
            onConfirm={() => {
              grant.reset();
              revoke.mutate({ key: newActionKey() });
            }}
          />
        </div>
      </div>
    );
  }

  if (paused) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu organización pausó las fotos de progreso. Consulta a tu profesional.
      </p>
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
        Si lo autorizas, tú y tu coach pueden subir tus fotos de progreso: frontal, lateral y
        posterior, al cerrar cada mesociclo.
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
          grant.mutate({ body: { purpose: 'PROGRESS_PHOTOS' }, key: newActionKey() });
        }}
      >
        {grant.isPending ? 'Autorizando…' : 'Autorizar mis fotos de progreso'}
      </Button>
    </div>
  );
}
