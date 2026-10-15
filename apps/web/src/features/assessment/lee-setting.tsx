'use client';

import { LEE_REFERENCE_GROUP_COEFFICIENTS, type SettingsResponse } from '@nutricoach/contracts';
import { Notice, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';

const KEY = 'assessment.lee_reference_group_coefficient';

/** El coeficiente con su signo, como lo escribe la ecuación: «0», «−2.0», «+1.1». */
const shown = (value: number) =>
  value === 0 ? '0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;

/**
 * Coeficiente de grupo de referencia de Lee (2000), RN-D11: lo fija la organización y no tiene valor por defecto; sin
 * él, la masa muscular esquelética de Lee no se calcula. La ficha del paciente no guarda el dato del que depende, y la
 * interfaz no lo nombra (Ley 29733, ADR-044).
 */
export function LeeCoefficientSetting({
  initial,
  canEdit,
}: {
  initial: number | null;
  canEdit: boolean;
}) {
  const canWrite = useCanWrite() && canEdit;
  const [value, setValue] = useState(initial);
  const save = useMutation({
    mutationFn: (next: number) =>
      apiFetch<SettingsResponse>(`/organization/settings/${KEY}`, {
        method: 'PUT',
        body: { value: next },
      }),
    onSuccess: (settings) => {
      setValue(settings[KEY]);
    },
  });
  return (
    <div className="flex max-w-xl flex-col gap-3">
      {value === null ? (
        <Notice
          tone="warning"
          title="Sin coeficiente: la masa muscular de Lee no se calcula"
          rule="RN-D11"
        />
      ) : (
        <p className="text-sm">
          Vigente: <StatusBadge tone="success">{shown(value)}</StatusBadge>
        </p>
      )}
      {canWrite ? (
        <Select
          label="Coeficiente de grupo de referencia de Lee (2000)"
          hint="El de la población de referencia de la ecuación que corresponde a tu consulta. Cambiarlo no recalcula nada (RN-D08); en cada evaluación se puede usar otro al recalcular."
          value={value === null ? undefined : String(value)}
          onValueChange={(text) => {
            save.mutate(Number(text));
          }}
          options={LEE_REFERENCE_GROUP_COEFFICIENTS.map((coefficient) => ({
            value: String(coefficient),
            label: shown(coefficient),
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Lo cambian el dueño y los administradores.</p>
      )}
      <FormError error={save.error} title="No se guardó el coeficiente" />
    </div>
  );
}
