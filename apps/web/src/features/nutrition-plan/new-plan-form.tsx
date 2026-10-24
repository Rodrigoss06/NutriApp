'use client';

import type {
  CreateNutritionPlan,
  EnergyPrescriptionListResponse,
  ExchangeList,
  NutritionPlan,
  PlanModality,
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
import { PLAN_MODALITY_LABELS } from './labels';

type Prescription = EnergyPrescriptionListResponse['prescriptions'][number];

const MODALITY_HINTS: Readonly<Record<PlanModality, string>> = {
  EXCHANGES:
    'Intercambios por grupo, repartidos por tiempos, con los alimentos que el paciente puede elegir.',
  COMPOSITION: 'Alimento por alimento, con sus gramos o medidas caseras en cada tiempo de comida.',
  WEEKLY_MENU: 'Siete días con alimentos o recetas, con una opción A y una B en cada tiempo.',
};

/**
 * Un plan nuevo (RF-19 a RF-21): parte de una prescripción energética del paciente, con sus metas exactas (RF-18), y
 * de su modalidad, que no cambia después. Por intercambios, también de una lista publicada: el plan sigue con esa
 * versión (RN-E11).
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
  const [modality, setModality] = useState<PlanModality>('EXCHANGES');
  const [prescriptionId, setPrescriptionId] = useState(prescriptions[0]?.id ?? '');
  const [listId, setListId] = useState(lists[0]?.id ?? '');
  const list = lists.find((l) => l.id === listId);
  const create = useMutation({
    mutationFn: () =>
      apiFetch<NutritionPlan>(`/patients/${patientId}/nutrition-plans`, {
        method: 'POST',
        body: (modality === 'EXCHANGES'
          ? { modality, energyPrescriptionId: prescriptionId, exchangeListId: listId }
          : { modality, energyPrescriptionId: prescriptionId }) satisfies CreateNutritionPlan,
      }),
    onSuccess: ({ id }) => {
      router.push(`/panel/pacientes/${patientId}/dieta/${id}`);
    },
  });
  const exchanges = modality === 'EXCHANGES';
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Select
        label="Modalidad"
        value={modality}
        onValueChange={(value) => {
          setModality(value as PlanModality);
        }}
        hint={MODALITY_HINTS[modality]}
        options={(Object.keys(PLAN_MODALITY_LABELS) as PlanModality[]).map((value) => ({
          value,
          label: PLAN_MODALITY_LABELS[value],
        }))}
      />
      <Select
        label="Prescripción energética"
        value={prescriptionId}
        onValueChange={setPrescriptionId}
        options={prescriptions.map((p) => ({
          value: p.id,
          label: `${formatInstant(p.createdAt, timezone)} · ${GOAL_LABELS[p.goal]} · ${formatNumber(p.targetKcal, 'kcal')} kcal`,
        }))}
      />
      {exchanges ? (
        <Select
          label="Lista de intercambio"
          value={listId}
          onValueChange={setListId}
          options={lists.map((l) => ({
            value: l.id,
            label: `${l.name} · versión ${l.version}${l.provisional ? ' (provisional)' : ''}`,
          }))}
        />
      ) : null}
      {exchanges && list?.provisional ? (
        <Notice tone="warning" title="Lista provisional">
          {list.note ??
            'Sus valores son de ejemplo mientras se confirma el permiso de la lista oficial.'}
        </Notice>
      ) : null}
      <FormError error={create.error} title="No se creó el plan" />
      <div>
        <Button
          disabled={!canWrite || !prescriptionId || (exchanges && !listId) || create.isPending}
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
