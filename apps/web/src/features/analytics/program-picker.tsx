'use client';

import { Select } from '@nutricoach/ui';
import { useRouter } from 'next/navigation';

/** Elegir de qué programa del paciente ver la analítica; el elegido queda en la dirección (`?programa=`). */
export function ProgramPicker({
  base,
  current,
  programs,
}: {
  base: string;
  current: string;
  programs: readonly { readonly id: string; readonly label: string }[];
}) {
  const router = useRouter();
  return (
    <Select
      label="Programa"
      className="max-w-md"
      value={current}
      onValueChange={(id) => {
        router.push(`${base}?programa=${encodeURIComponent(id)}`);
      }}
      options={programs.map((program) => ({ value: program.id, label: program.label }))}
    />
  );
}
