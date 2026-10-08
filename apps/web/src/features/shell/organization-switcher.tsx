'use client';

import { Select } from '@nutricoach/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

export interface OrganizationOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Selector de organización activa (RF-04). Solo aparece con más de una membresía. Al cambiar, la sesión guarda la
 * nueva organización y se vacía la caché, para no mostrar datos de la anterior.
 */
export function OrganizationSwitcher({
  organizations,
  activeId,
}: {
  organizations: readonly OrganizationOption[];
  activeId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch('/session/active-organization', { method: 'POST', body: { organizationId } }),
    onSuccess: () => {
      queryClient.clear();
      router.push('/panel');
      router.refresh();
    },
  });
  if (organizations.length < 2) return null;
  return (
    <Select
      label={<span className="sr-only">Organización activa</span>}
      options={organizations.map((organization) => ({
        value: organization.id,
        label: organization.name,
      }))}
      value={activeId || undefined}
      placeholder="Elige una organización"
      disabled={change.isPending}
      onValueChange={(id) => {
        change.mutate(id);
      }}
      className="w-56"
    />
  );
}
