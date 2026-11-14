'use client';

import type { MemberResponse } from '@nutricoach/contracts';
import { Select } from '@nutricoach/ui';
import { useRouter } from 'next/navigation';

/** El dueño y el administrador eligen de qué profesional ver o cambiar la disponibilidad. */
export function MemberChooser({
  members,
  memberId,
}: {
  members: readonly MemberResponse[];
  memberId: string;
}) {
  const router = useRouter();
  return (
    <Select
      label="Profesional"
      className="w-64"
      value={memberId}
      onValueChange={(value) => {
        router.push(`/panel/agenda/disponibilidad?profesional=${value}`);
      }}
      options={members
        .filter((member) => member.status === 'ACTIVE')
        .map((member) => ({ value: member.id, label: member.displayName }))}
    />
  );
}
