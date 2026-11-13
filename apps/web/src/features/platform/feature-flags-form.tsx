'use client';

import {
  FEATURE_FLAG_LABELS,
  type FeatureFlag,
  type PlatformFeatureFlagsResponse,
} from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { setFeatureFlag } from './platform-api';

/**
 * Las banderas de la organización (RF-39, ADR-127): apagada, la función desaparece de la API, del panel y de la app de sus
 * pacientes. Cada cambio queda en la auditoría.
 */
export function FeatureFlagsForm({
  organizationId,
  flags: initial,
}: {
  organizationId: string;
  flags: PlatformFeatureFlagsResponse['flags'];
}) {
  const [flags, setFlags] = useState(initial);
  // Optimista: la casilla cambia al tocarla y vuelve atrás si la API no la guarda.
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: FeatureFlag; enabled: boolean }) =>
      setFeatureFlag(organizationId, key, enabled),
    onMutate: ({ key, enabled }) => {
      const previous = flags;
      setFlags(flags.map((flag) => (flag.key === key ? { ...flag, enabled } : flag)));
      return previous;
    },
    onError: (_error, _variables, previous) => {
      if (previous) setFlags(previous);
    },
    onSuccess: (response) => {
      setFlags(response.flags);
    },
  });
  return (
    <section aria-labelledby="banderas" className="flex flex-col gap-3">
      <h2 id="banderas" className="text-lg font-semibold">
        Funciones
      </h2>
      <ul className="flex flex-col gap-2">
        {flags.map((flag) => (
          <li
            key={flag.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <label className="flex min-h-touch items-center gap-3">
              <input
                type="checkbox"
                className="size-5"
                checked={flag.enabled}
                onChange={(event) => {
                  toggle.mutate({ key: flag.key, enabled: event.target.checked });
                }}
              />
              <span className="font-medium">{FEATURE_FLAG_LABELS[flag.key]}</span>
            </label>
            <StatusBadge tone={flag.enabled ? 'success' : 'warning'}>
              {flag.enabled ? 'Activa' : 'Apagada'}
              {flag.source === 'DEFAULT' ? ' (de fábrica)' : ''}
            </StatusBadge>
          </li>
        ))}
      </ul>
      <FormError error={toggle.error} title="No se cambió la función" />
    </section>
  );
}
