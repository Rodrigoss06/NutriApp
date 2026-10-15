'use client';

import {
  EVALUATION_KINDS,
  EVALUATION_LEVELS,
  type CreateEvaluation,
  type EvaluationLevel,
  type EvaluationResponse,
  type EvaluationSummary,
  type MeasurementSite,
  type MemberResponse,
} from '@nutricoach/contracts';
import { Button, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckboxField, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { instantIn, localDateTimeIn } from '@/lib/dates';
import { KIND_LABELS, LEVEL_DESCRIPTIONS, LEVEL_LABELS } from './labels';

/**
 * Nueva evaluación (RF-11): tipo, nivel, fecha y hora del consultorio, evaluador y condiciones (RN-C09). El nivel decide
 * los sitios que se exigen para cerrar y los métodos disponibles (RN-C01); una de bioimpedancia no lleva nivel.
 * Sin el consentimiento de datos de salud, la API responde 422 con RN-B01.
 */
export function NewEvaluationForm({
  patientId,
  sites,
  members,
}: {
  patientId: string;
  sites: readonly MeasurementSite[];
  members: readonly MemberResponse[];
}) {
  const router = useRouter();
  const { userId, timezone } = usePanelSession();
  const canWrite = useCanWrite();
  const active = members.filter((m) => m.status === 'ACTIVE');
  const me = active.find((m) => m.userId === userId);
  const [kind, setKind] = useState<EvaluationSummary['kind']>('ANTHROPOMETRY');
  const [level, setLevel] = useState<EvaluationLevel>('ISAK2');
  const [measuredAt, setMeasuredAt] = useState(() => localDateTimeIn(timezone));
  const [evaluator, setEvaluator] = useState(me?.id ?? active[0]?.id ?? '');
  const [fasting, setFasting] = useState(false);
  const [intenseActivity, setIntenseActivity] = useState(false);
  const [hydration, setHydration] = useState('');
  const [notes, setNotes] = useState('');
  const create = useMutation({
    mutationFn: (body: CreateEvaluation) =>
      apiFetch<EvaluationResponse>(`/patients/${patientId}/evaluations`, { method: 'POST', body }),
    onSuccess: ({ id }) => {
      router.push(`/panel/pacientes/${patientId}/evaluaciones/${id}`);
    },
  });
  const count = (value: EvaluationLevel) => sites.filter((s) => s.levels.includes(value)).length;

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({
          kind,
          level: kind === 'BIA' ? null : level,
          measuredAt: instantIn(measuredAt, timezone),
          evaluatorMemberId: evaluator || undefined,
          conditions: {
            schemaVersion: 1,
            fasting,
            intenseActivityLast24h: intenseActivity,
            hydration: hydration.trim() || null,
          },
          notes: notes.trim() || null,
        });
      }}
    >
      <FormError error={create.error} title="No se pudo crear la evaluación" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Tipo"
          value={kind}
          onValueChange={(value) => {
            setKind(value as EvaluationSummary['kind']);
          }}
          options={EVALUATION_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }))}
        />
        {kind === 'BIA' ? null : (
          <Select
            label="Nivel"
            value={level}
            onValueChange={(value) => {
              setLevel(value as EvaluationLevel);
            }}
            hint="Decide los sitios que se miden y los métodos disponibles (RN-C01)."
            options={EVALUATION_LEVELS.map((value) => ({
              value,
              label: `${LEVEL_LABELS[value]} · ${LEVEL_DESCRIPTIONS[value].toLowerCase()} (${String(count(value))} sitios)`,
            }))}
          />
        )}
        <TextField
          label="Fecha y hora de la medición"
          type="datetime-local"
          value={measuredAt}
          max={localDateTimeIn(timezone)}
          hint="La hora del consultorio."
          onChange={(event) => {
            setMeasuredAt(event.target.value);
          }}
        />
        <Select
          label="Evaluador"
          value={evaluator || undefined}
          onValueChange={setEvaluator}
          options={active.map((m) => ({ value: m.id, label: m.displayName }))}
        />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Condiciones</legend>
        <CheckboxField
          label="En ayunas"
          checked={fasting}
          onChange={(event) => {
            setFasting(event.target.checked);
          }}
        />
        <CheckboxField
          label="Actividad física intensa en las últimas 24 horas"
          checked={intenseActivity}
          onChange={(event) => {
            setIntenseActivity(event.target.checked);
          }}
        />
        <TextField
          label="Hidratación"
          autoComplete="off"
          maxLength={200}
          hint="En palabras del evaluador. Opcional."
          value={hydration}
          onChange={(event) => {
            setHydration(event.target.value);
          }}
        />
      </fieldset>
      <TextAreaField
        label="Notas"
        maxLength={2000}
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value);
        }}
      />
      <Notice tone="info" title="Al comparar dos evaluaciones">
        Se advierte si cambian el evaluador, el ayuno o la actividad previa, o si la hora del día se
        aleja más de 2 horas (RN-C09).
      </Notice>
      <div>
        <Button type="submit" disabled={!canWrite || create.isPending || measuredAt === ''}>
          {create.isPending ? 'Creando…' : 'Crear evaluación'}
        </Button>
      </div>
    </form>
  );
}
