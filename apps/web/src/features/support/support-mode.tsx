'use client';

import {
  SUPPORT_SCOPE_LABELS,
  type AccountResponse,
  type PlatformSupportGrant,
  type SupportSession,
} from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';

/**
 * La franja del modo soporte (RN-A09, ADR-130): qué organización mira, con qué alcance y hasta cuándo, que no puede cambiar nada y que
 * todo queda en la auditoría de esa organización.
 */
export function SupportBanner({
  support,
  timezone,
}: {
  support: SupportSession;
  timezone: string;
}) {
  return (
    <Notice tone="warning" title="Modo soporte · solo lectura">
      Ves {support.organizationName} con el permiso que te dio su dueño (
      {SUPPORT_SCOPE_LABELS[support.scope].toLowerCase()}) hasta el{' '}
      {formatInstant(support.expiresAt, timezone)}. No puedes cambiar nada y todo lo que miras queda
      en su auditoría.
    </Notice>
  );
}

/** Salir del modo soporte: vuelve al panel interno. Siempre funciona, también con el permiso vencido. */
export function LeaveSupportButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const leave = useMutation({
    mutationFn: () => apiFetch<AccountResponse>('/platform/support/session', { method: 'DELETE' }),
    onSettled: () => {
      queryClient.clear();
      router.replace('/admin/plataforma');
      router.refresh();
    },
  });
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={leave.isPending}
      onClick={() => {
        leave.mutate();
      }}
    >
      <LifeBuoy aria-hidden />
      Salir del modo soporte
    </Button>
  );
}

/** Los permisos de soporte vigentes de quien entra al panel interno, cada uno con «Entrar en modo soporte». */
export function SupportGrantsList({ grants }: { grants: readonly PlatformSupportGrant[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const enter = useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch<AccountResponse>('/platform/support/session', {
        method: 'POST',
        body: { organizationId },
      }),
    onSuccess: () => {
      queryClient.clear();
      router.push('/panel');
      router.refresh();
    },
  });
  if (grants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ningún dueño te dio un permiso de soporte vigente. Para mirar una organización, pídele uno a
        su dueño: lo da desde Organización › Soporte de la plataforma.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <FormError error={enter.error} title="No pudiste entrar" />
      <ul
        aria-label="Tus permisos de soporte"
        className="divide-y divide-border rounded-lg border border-border bg-card"
      >
        {grants.map((grant) => (
          <li key={grant.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{grant.organizationName}</span>
              <span className="text-sm text-muted-foreground">
                {SUPPORT_SCOPE_LABELS[grant.scope]} · vence el{' '}
                {formatInstant(grant.expiresAt, 'America/Lima')}
              </span>
              <span className="text-sm break-words">{grant.reason}</span>
            </div>
            <Button
              size="sm"
              disabled={enter.isPending}
              onClick={() => {
                enter.mutate(grant.organizationId);
              }}
            >
              <LogIn aria-hidden />
              Entrar en modo soporte
              <span className="sr-only"> a {grant.organizationName}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
