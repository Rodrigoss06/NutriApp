'use client';

import type { CareTeamMember, MemberResponse, MesocycleReportVersion } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';

/** Crea el borrador del informe de un mesociclo y lo abre (RN-G19). Lo ve quien escribe en el expediente; la API decide. */
export function CreateMesocycleReport({
  patientId,
  programId,
  mesocyclePosition,
  mesocycleName,
  careTeam,
  members,
}: {
  patientId: string;
  programId: string;
  mesocyclePosition: number;
  mesocycleName: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const writes = useWritesRecord(careTeam, members);
  const create = useMutation({
    mutationFn: () =>
      apiFetch<MesocycleReportVersion>(`/patients/${patientId}/mesocycle-reports`, {
        method: 'POST',
        body: { programId, mesocyclePosition },
      }),
    onSuccess: ({ id }) => {
      router.push(`/panel/pacientes/${patientId}/entrenamiento/informes/${id}`);
    },
  });
  if (!canWrite || !writes) {
    return <span className="text-sm text-muted-foreground">Sin informe</span>;
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        disabled={create.isPending}
        aria-label={`Crear el informe de «${mesocycleName}»`}
        onClick={() => {
          create.mutate();
        }}
      >
        {create.isPending ? 'Creando…' : 'Crear informe'}
      </Button>
      <FormError error={create.error} title="No se creó el informe" />
    </div>
  );
}
