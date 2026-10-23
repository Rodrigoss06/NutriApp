'use client';

import type {
  EnergyPrescriptionListResponse,
  ExchangeList,
  NutritionPlan,
} from '@nutricoach/contracts';
import { Button, formatNumber, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GOAL_LABELS } from '@/features/energy/labels';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';

type Prescription = EnergyPrescriptionListResponse['prescriptions'][number];

/**
 * Un plan por intercambios nuevo (RF-19): parte de una prescripción energética del paciente, con sus metas exactas
 * (RF-18), y de una lista de intercambio publicada; el plan sigue con esa versión de la lista (RN-E11).
 */
export function NewPlanForm({
  patientId,
  prescriptions,
  lists,
}: {
  patientId: string;
  prescriptions: readonly Prescription[];
  lists: readonly ExchangeList[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const { timezone } = usePanelSession();
  const [prescriptionId, setPrescriptionId] = useState(prescriptions[0]?.id ?? '');
  const [listId, setListId] = useState(lists[0]?.id ?? '');
  const list = lists.find((l) => l.id === listId);
  const create = useMutation({
    mutationFn: () =>
      apiFetch<NutritionPlan>(`/patients/${patientId}/nutrition-plans`, {
        method: 'POST',
        body: { energyPrescriptionId: prescriptionId, exchangeListId: listId },
      }),
    onSuccess: ({ id }) => {
      router.push(`/panel/pacientes/${patientId}/dieta/${id}`);
    },
  });
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Select
        label="Prescripción energética"
        value={prescriptionId}
        onValueChange={setPrescriptionId}
        options={prescriptions.map((p) => ({
          value: p.id,
          label: `${formatInstant(p.createdAt, timezone)} · ${GOAL_LABELS[p.goal]} · ${formatNumber(p.targetKcal, 'kcal')} kcal`,
        }))}
      />
      <Select
        label="Lista de intercambio"
        value={listId}
        onValueChange={setListId}
        options={lists.map((l) => ({
          value: l.id,
          label: `${l.name} · versión ${l.version}${l.provisional ? ' (provisional)' : ''}`,
        }))}
      />
      {list?.provisional ? (
        <Notice tone="warning" title="Lista provisional">
          {list.note ??
            'Sus valores son de ejemplo mientras se confirma el permiso de la lista oficial.'}
        </Notice>
      ) : null}
      <FormError error={create.error} title="No se creó el plan" />
      <div>
        <Button
          disabled={!canWrite || !prescriptionId || !listId || create.isPending}
          onClick={() => {
            create.mutate();
          }}
        >
          {create.isPending ? 'Creando…' : 'Crear borrador'}
        </Button>
      </div>
    </div>
  );
}
