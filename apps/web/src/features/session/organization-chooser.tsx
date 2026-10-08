'use client';

import type { Membership } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { ROLE_LABELS } from '@/features/organization/labels';

/** Con varias membresías y ninguna activa, se elige con qué organización trabajar (RF-04). */
export function OrganizationChooser({ memberships }: { memberships: readonly Membership[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const choose = useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch('/session/active-organization', { method: 'POST', body: { organizationId } }),
    onSuccess: () => {
      queryClient.clear();
      router.refresh();
    },
  });
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">¿Con qué organización trabajarás?</h1>
      <FormError error={choose.error} />
      <ul className="flex flex-col gap-2">
        {memberships.map((membership) => (
          <li key={membership.organizationId}>
            <Button
              variant="secondary"
              className="h-auto w-full justify-between py-3"
              disabled={choose.isPending}
              onClick={() => {
                choose.mutate(membership.organizationId);
              }}
            >
              <span>{membership.organizationName}</span>
              <span className="text-muted-foreground">{ROLE_LABELS[membership.role]}</span>
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
