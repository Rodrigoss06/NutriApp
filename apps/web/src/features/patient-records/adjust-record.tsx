'use client';

import type {
  AdjustRecord as AdjustRecordBody,
  AdjustmentTarget,
  CareTeamMember,
  MemberResponse,
  RecordAdjustment,
} from '@nutricoach/contracts';
import { Button, cn, Notice, NumberField } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { apiFetch } from '@/lib/api/client';
import { adjustmentBody, type CorrectableField, type CorrectionField } from './adjustments';

/**
 * Ajustar un registro del paciente (RN-G02): excluirlo o corregir su cantidad o sus valores, siempre con un motivo. El registro
 * original no cambia; el día muestra el valor ajustado. Solo lo ve quien escribe en el expediente (RN-A05); decide la API.
 */
export function AdjustRecord({
  patientId,
  careTeam,
  members,
  targetType,
  targetId,
  localDate,
  description,
  fields,
}: {
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  targetType: AdjustmentTarget;
  targetId: string;
  localDate: string;
  /** Qué registro es, para el lector de pantalla: «Agua, 250 ml». */
  description: string;
  fields: readonly CorrectableField[];
}) {
  const router = useRouter();
  const regionId = useId();
  const writes = useWritesRecord(careTeam, members);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'EXCLUDE' | 'CORRECT'>(
    fields.length > 0 ? 'CORRECT' : 'EXCLUDE',
  );
  const [values, setValues] = useState<Partial<Record<CorrectionField, number | null>>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.current])),
  );
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: AdjustRecordBody) =>
      apiFetch<RecordAdjustment>(`/patients/${patientId}/record-adjustments`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      router.refresh();
    },
  });
  if (!writes) return null;

  const submit = () => {
    const built = adjustmentBody({
      targetType,
      targetId,
      targetLocalDate: localDate,
      action,
      fields,
      values,
      reason,
    });
    setProblem(built.ok ? null : built.problem);
    if (built.ok) save.mutate(built.body);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={regionId}
        aria-label={`Ajustar: ${description}`}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        Ajustar
      </Button>
      <div
        id={regionId}
        hidden={!open}
        className="flex min-w-64 flex-col gap-3 rounded-lg border border-border bg-card p-3"
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Qué hacer con el registro</legend>
          <div className="flex gap-2">
            {(fields.length > 0 ? (['CORRECT', 'EXCLUDE'] as const) : (['EXCLUDE'] as const)).map(
              (option) => (
                <label key={option} className="flex-1">
                  <input
                    type="radio"
                    name={`${regionId}-accion`}
                    checked={action === option}
                    onChange={() => {
                      setAction(option);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'flex min-h-touch cursor-pointer items-center justify-center rounded-md border border-brand-border bg-card px-3 text-sm font-medium text-brand-text',
                      'peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground',
                      'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-border',
                    )}
                  >
                    {option === 'CORRECT' ? 'Corregir' : 'Excluir'}
                  </span>
                </label>
              ),
            )}
          </div>
        </fieldset>
        {action === 'CORRECT' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <NumberField
                key={field.key}
                label={field.label}
                {...(field.unit ? { unit: field.unit } : {})}
                inputMode={field.integer ? 'numeric' : 'decimal'}
                value={values[field.key] ?? null}
                onValueChange={(value) => {
                  setValues((current) => ({ ...current, [field.key]: value }));
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            El registro deja de contar en el día y en la analítica; el original se conserva.
          </p>
        )}
        <TextAreaField
          label="Motivo"
          hint="Obligatorio, de 10 caracteres o más. Queda con tu nombre."
          maxLength={2_000}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        {problem ? <Notice tone="danger" title={problem} /> : null}
        <FormError error={save.error} title="No se guardó el ajuste" />
        <div>
          <Button size="sm" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Guardando…' : 'Guardar ajuste'}
          </Button>
        </div>
      </div>
    </div>
  );
}
