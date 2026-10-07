'use client';

import { Select } from '@nutricoach/ui';
import { usePathname, useRouter } from 'next/navigation';

export interface OrganizationOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Selector de organización activa (RF-04). Solo aparece si el usuario es miembro de más de una. Cambiarla la
 * fija en la sesión; hasta P5 solo recarga con `?org=`.
 */
export function OrganizationSwitcher({
  organizations,
  activeId,
}: {
  organizations: readonly OrganizationOption[];
  activeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (organizations.length < 2) return null;
  return (
    <Select
      label={<span className="sr-only">Organización activa</span>}
      options={organizations.map((organization) => ({
        value: organization.id,
        label: organization.name,
      }))}
      value={activeId}
      onValueChange={(id) => {
        router.push(`${pathname}?org=${encodeURIComponent(id)}`);
      }}
      className="w-56"
    />
  );
}
