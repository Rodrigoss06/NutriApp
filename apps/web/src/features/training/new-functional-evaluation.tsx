'use client';

import {
  PHYSICAL_MOMENT_LABELS,
  PHYSICAL_MOMENTS,
  type CareTeamMember,
  type CreateFunctionalEvaluation,
  type FunctionalKind,
  type MemberResponse,
} from '@nutricoach/contracts';
import { Button, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { instantIn, localDateTimeIn } from '@/lib/dates';
import { useEditsRecord } from './use-edits-record';

const LABELS = {
  MOVEMENT: 'evaluación postural',
  FITNESS: 'evaluación de pruebas físicas',
} as const;

/** Abre un borrador: evalúa quien la crea. Las pruebas físicas llevan su momento; la postura, no (07 §4). */
export function NewFunctionalEvaluation({
  patientId,
  kind,
  careTeam,
  members,
  archived,
  base,
}: {
  patientId: string;
  kind: FunctionalKind;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
  base: string;
}) {
  const router = useRouter();
  const { timezone } = usePanelSession();
  const editable = useEditsRecord(careTeam, members, archived);
  const [measuredAt, setMeasuredAt] = useState(() => localDateTimeIn(timezone));
  const [moment, setMoment] = useState<(typeof PHYSICAL_MOMENTS)[number]>('BASELINE');
  const create = useMutation({
    mutationFn: (body: CreateFunctionalEvaluation) =>
      apiFetch<{ id: string }>(`/patients/${patientId}/functional-evaluations`, {
        method: 'POST',
        body,
      }),
    onSuccess: ({ id }) => {
      router.push(`${base}/${id}`);
    },
  });
  if (!editable) return null;
  return (
    <form
      noValidate
      aria-label={`Nueva ${LABELS[kind]}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({
          kind,
          measuredAt: instantIn(measuredAt, timezone),
          moment: kind === 'FITNESS' ? moment : null,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Fecha y hora de la evaluación"
          type="datetime-local"
          value={measuredAt}
          max={localDateTimeIn(timezone)}
          hint="La hora del consultorio."
          onChange={(event) => {
            setMeasuredAt(event.target.value);
          }}
        />
        {kind === 'FITNESS' ? (
          <Select
            label="Momento"
            value={moment}
            onValueChange={(value) => {
              setMoment(value as (typeof PHYSICAL_MOMENTS)[number]);
            }}
            options={PHYSICAL_MOMENTS.map((code) => ({
              value: code,
              label: PHYSICAL_MOMENT_LABELS[code],
            }))}
          />
        ) : null}
      </div>
      <FormError error={create.error} title="No se pudo crear la evaluación" />
      <div>
        <Button type="submit" disabled={create.isPending || measuredAt === ''}>
          {create.isPending ? 'Creando…' : `Nueva ${LABELS[kind]}`}
        </Button>
      </div>
    </form>
  );
}
