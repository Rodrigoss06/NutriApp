'use client';

import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/problem';

/**
 * Al abrir el control semanal, las semanas cerradas se calculan ya, sin esperar al trabajo de cada hora (07 §10, ADR-089).
 * Con los mismos registros no cambia nada; si llegaron registros tardíos, la página se actualiza con el control nuevo. Solo
 * lo pide quien escribe en el expediente; para los demás, la página muestra lo último que calculó el trabajo.
 */
export function ComputeReviews({
  patientId,
  careTeam,
  members,
}: {
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const writes = useWritesRecord(careTeam, members);
  const started = useRef(false);
  const compute = useMutation({
    mutationFn: () =>
      apiFetch<{ written: number }>(`/patients/${patientId}/weekly-reviews/compute`, {
        method: 'POST',
      }),
    onSuccess: ({ written }) => {
      if (written > 0) router.refresh();
    },
  });
  const { mutate } = compute;
  const enabled = canWrite && writes;

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    mutate();
  }, [enabled, mutate]);

  if (!enabled) return null;
  return (
    <p role="status" className="min-h-6 text-sm text-muted-foreground">
      {compute.isPending ? 'Calculando las semanas cerradas…' : null}
      {compute.isSuccess && compute.data.written > 0
        ? `Se calcularon ${String(compute.data.written)} ${compute.data.written === 1 ? 'control' : 'controles'} con los registros nuevos.`
        : null}
      {compute.isError ? `No pudimos calcular ahora: ${errorMessage(compute.error)}` : null}
    </p>
  );
}
