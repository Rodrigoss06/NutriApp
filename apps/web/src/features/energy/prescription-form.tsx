'use client';

import {
  ENERGY_GOALS,
  methodLabel,
  type EnergyBasisResponse,
  type EnergyPrescription,
  type EnergyPrescriptionPreview,
  type EvaluationSummary,
  type PhysicalActivityListResponse,
  type RmrMethod,
} from '@nutricoach/contracts';
import { Button, formatNumber, MethodBadge, Notice, Select } from '@nutricoach/ui';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { evaluationTitle } from '@/features/assessment/labels';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { prescriptionBody, type ActivityDraft } from './form';
import {
  ADJUSTMENT_OPTIONS,
  DEFAULT_ADJUSTMENT,
  formatInput,
  GOAL_LABELS,
  STRATEGY_LABELS,
  type AdjustmentOption,
} from './labels';
import { PrescriptionView } from './prescription-view';

type Goal = EnergyPrescriptionPreview['goal'];
type Strategy = EnergyPrescriptionPreview['strategy'];

/** Espera a que la persona deje de escribir antes de pedir la vista previa. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

/**
 * Nueva prescripción energética (RF-17, RF-18 adelantado): TMR con cinco ecuaciones (RN-E01), PAL de la vida diaria y
 * ejercicio del Compendium sin contarlo dos veces (RN-E02, RN-E03), objetivo con su ritmo (RN-E04), peso objetivo y
 * fecha estimada (RN-E05, RN-E06) y macronutrientes con la proteína primero (RN-E07). La vista previa la calcula la API
 * con el motor mientras se escribe; guardar crea una prescripción que no se edita.
 */
export function PrescriptionForm({
  patientId,
  basis,
  evaluations,
}: {
  patientId: string;
  basis: EnergyBasisResponse;
  evaluations: readonly EvaluationSummary[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const { timezone } = usePanelSession();
  const firstAvailable = basis.rmrOptions.find((option) => option.rmrKcal !== null)?.methodCode;
  const [rmrMethodCode, setRmrMethodCode] = useState<RmrMethod>(
    basis.preferredRmrMethodCode ?? firstAvailable ?? 'RMR_MIFFLIN1990',
  );
  const [strategy, setStrategy] = useState<Strategy>('ADDITIVE');
  const [pal, setPal] = useState('');
  const [activities, setActivities] = useState<ActivityDraft[]>([]);
  const [goal, setGoal] = useState<Goal>('LOSE_FAT');
  const [adjustment, setAdjustment] = useState<AdjustmentOption>(DEFAULT_ADJUSTMENT.LOSE_FAT);
  const [amount, setAmount] = useState('');
  const [targetFatPct, setTargetFatPct] = useState('');
  const [proteinGPerKg, setProteinGPerKg] = useState('');
  const [fatPctKcal, setFatPctKcal] = useState('');
  const [search, setSearch] = useState('');

  const body = prescriptionBody({
    evaluationId: basis.evaluation.id,
    rmrMethodCode,
    strategy,
    pal,
    activities,
    goal,
    adjustment,
    amount,
    targetFatPct,
    proteinGPerKg,
    fatPctKcal,
  });
  const debouncedBody = useDebounced(body, 300);
  const preview = useQuery({
    queryKey: ['energy-preview', patientId, JSON.stringify(debouncedBody)],
    queryFn: () =>
      apiFetch<EnergyPrescriptionPreview>(`/patients/${patientId}/energy-prescriptions/preview`, {
        method: 'POST',
        body: debouncedBody,
      }),
    enabled: debouncedBody !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const query = useDebounced(search.trim(), 250);
  const found = useQuery({
    queryKey: ['physical-activities', query],
    queryFn: () =>
      apiFetch<PhysicalActivityListResponse>(`/physical-activities?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
  const save = useMutation({
    mutationFn: () =>
      apiFetch<EnergyPrescription>(`/patients/${patientId}/energy-prescriptions`, {
        method: 'POST',
        body,
      }),
    onSuccess: ({ id }) => {
      router.push(`/panel/pacientes/${patientId}/energia/${id}`);
    },
  });
  const upToDate =
    body !== null && JSON.stringify(body) === JSON.stringify(debouncedBody) && preview.isSuccess;
  const option = ADJUSTMENT_OPTIONS[adjustment];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="base-titulo" className="flex flex-col gap-3">
        <h2 id="base-titulo" className="text-lg font-semibold">
          Base
        </h2>
        {evaluations.length > 1 ? (
          <div className="max-w-md">
            <Select
              label="Evaluación de base"
              value={basis.evaluation.id}
              onValueChange={(id) => {
                router.replace(`/panel/pacientes/${patientId}/energia/nueva?evaluacion=${id}`);
              }}
              options={evaluations.map((e) => ({
                value: e.id,
                label: `${formatInstant(e.measuredAt, timezone)} · ${evaluationTitle(e)}`,
              }))}
            />
          </div>
        ) : (
          <p className="text-sm">
            Evaluación del {formatInstant(basis.evaluation.measuredAt, timezone)}.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Peso {formatNumber(basis.weightKg, 'mass')} kg · talla{' '}
          {formatNumber(basis.heightCm, 'length')} cm · {Math.floor(basis.ageYears)} años al medir
          {basis.fatFreeMass
            ? ` · masa libre de grasa ${formatNumber(basis.fatFreeMass.kg, 'mass')} kg (${methodLabel(basis.fatFreeMass.methodCode)})`
            : ' · sin masa libre de grasa: Cunningham y Katch-McArdle no se pueden usar'}
        </p>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-lg font-semibold">Tasa metabólica en reposo (TMR)</legend>
        <p className="text-sm text-muted-foreground">
          Cunningham y Katch-McArdle usan la masa libre de grasa de la evaluación y la citan
          (RN-E01).
        </p>
        {basis.rmrOptions.map((choice) => {
          const id = `tmr-${choice.methodCode}`;
          return (
            <div key={choice.methodCode} className="flex flex-col gap-1">
              <div className="flex min-h-touch items-center gap-3">
                <input
                  id={id}
                  type="radio"
                  name="tmr"
                  className="size-5 accent-brand"
                  disabled={choice.rmrKcal === null}
                  checked={rmrMethodCode === choice.methodCode}
                  onChange={() => {
                    setRmrMethodCode(choice.methodCode);
                  }}
                />
                <label htmlFor={id} className="flex flex-1 flex-wrap items-center gap-x-2">
                  <span>{methodLabel(choice.methodCode)}</span>
                  <span className="font-semibold tabular-nums">
                    {choice.rmrKcal === null
                      ? 'no disponible'
                      : `${formatNumber(choice.rmrKcal, 'kcal')} kcal`}
                  </span>
                </label>
              </div>
              {choice.issues.map((issue) => (
                <p
                  key={issue.code}
                  className={
                    issue.severity === 'ERROR'
                      ? 'pl-8 text-sm text-danger'
                      : 'pl-8 text-sm text-warning'
                  }
                >
                  {issue.message} ({issue.rule})
                </p>
              ))}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">Gasto energético</legend>
        <div className="flex flex-col gap-1">
          {(['ADDITIVE', 'FACTORIAL'] as const).map((value) => (
            <div key={value} className="flex min-h-touch items-center gap-3">
              <input
                id={`estrategia-${value}`}
                type="radio"
                name="estrategia"
                className="size-5 accent-brand"
                checked={strategy === value}
                onChange={() => {
                  setStrategy(value);
                }}
              />
              <label htmlFor={`estrategia-${value}`}>{STRATEGY_LABELS[value]}</label>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Con la aditiva, el PAL describe solo la vida diaria y el ejercicio se suma aparte; con
            la factorial, el PAL ya lo incluye. Así el ejercicio no se cuenta dos veces (RN-E02).
          </p>
        </div>
        <div className="max-w-xs">
          <TextField
            label="PAL de la vida diaria"
            inputMode="decimal"
            autoComplete="off"
            hint="De 1.40 a 2.40."
            value={pal}
            onChange={(event) => {
              setPal(event.target.value);
            }}
          />
        </div>
        {strategy === 'ADDITIVE' ? (
          <div className="flex flex-col gap-3">
            <div className="max-w-md">
              <TextField
                label="Buscar actividad"
                type="search"
                autoComplete="off"
                hint="Compendium 2024: escribe al menos 2 letras, sin importar las tildes."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </div>
            {found.data && query.length >= 2 ? (
              found.data.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin resultados.</p>
              ) : (
                <ul
                  aria-label="Actividades encontradas"
                  className="flex flex-col divide-y divide-border rounded-lg border border-border"
                >
                  {found.data.activities.slice(0, 10).map((activity) => {
                    const added = activities.some((a) => a.activityCode === activity.code);
                    return (
                      <li
                        key={activity.code}
                        className="flex flex-wrap items-center justify-between gap-2 p-2"
                      >
                        <span className="text-sm">
                          {activity.descriptionEs}{' '}
                          <span className="text-muted-foreground tabular-nums">
                            · {formatInput(activity.met)} MET · {activity.code}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={added}
                          aria-label={`Agregar ${activity.descriptionEs}`}
                          onClick={() => {
                            setActivities((current) => [
                              ...current,
                              {
                                activityCode: activity.code,
                                descriptionEs: activity.descriptionEs,
                                met: activity.met,
                                minutes: '',
                                sessions: '',
                              },
                            ]);
                            setSearch('');
                          }}
                        >
                          {added ? 'Agregada' : 'Agregar'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
            {activities.map((activity) => (
              <div
                key={activity.activityCode}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {activity.descriptionEs}{' '}
                    <span className="text-sm text-muted-foreground tabular-nums">
                      · {formatInput(activity.met)} MET
                    </span>
                  </p>
                  <MethodBadge
                    label={methodLabel('EE_MET_COMPENDIUM2024')}
                    code="EE_MET_COMPENDIUM2024"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    label={`Minutos por sesión: ${activity.descriptionEs}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={activity.minutes}
                    onChange={(event) => {
                      const minutes = event.target.value;
                      setActivities((current) =>
                        current.map((a) =>
                          a.activityCode === activity.activityCode ? { ...a, minutes } : a,
                        ),
                      );
                    }}
                  />
                  <TextField
                    label={`Sesiones por semana: ${activity.descriptionEs}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={activity.sessions}
                    onChange={(event) => {
                      const sessions = event.target.value;
                      setActivities((current) =>
                        current.map((a) =>
                          a.activityCode === activity.activityCode ? { ...a, sessions } : a,
                        ),
                      );
                    }}
                  />
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setActivities((current) =>
                          current.filter((a) => a.activityCode !== activity.activityCode),
                        );
                      }}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">Objetivo</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Objetivo"
            value={goal}
            onValueChange={(value) => {
              const next = value as Goal;
              setGoal(next);
              setAdjustment(DEFAULT_ADJUSTMENT[next]);
            }}
            options={ENERGY_GOALS.map((value) => ({ value, label: GOAL_LABELS[value] }))}
          />
          <Select
            label="Ajuste"
            value={adjustment}
            onValueChange={(value) => {
              setAdjustment(value as AdjustmentOption);
            }}
            options={(Object.keys(ADJUSTMENT_OPTIONS) as AdjustmentOption[]).map((value) => ({
              value,
              label: ADJUSTMENT_OPTIONS[value].label,
            }))}
          />
          {option.sign === 0 ? null : (
            <TextField
              label="Cantidad"
              inputMode="decimal"
              autoComplete="off"
              hint={
                option.kind === 'FAT_KG_PER_MONTH'
                  ? 'kg por mes (7700 kcal por kg).'
                  : 'kcal por día.'
              }
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          )}
        </div>
        <div className="max-w-xs">
          <TextField
            label="% de grasa deseado"
            inputMode="decimal"
            autoComplete="off"
            hint="Opcional: para el peso objetivo y la fecha estimada (RN-E06)."
            value={targetFatPct}
            onChange={(event) => {
              setTargetFatPct(event.target.value);
            }}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">Macronutrientes</legend>
        <p className="text-sm text-muted-foreground">
          Primero la proteína por kg de peso, después la grasa como % de las kcal y los
          carbohidratos con lo que queda (RN-E07).
        </p>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <TextField
            label="Proteína (g por kg de peso)"
            inputMode="decimal"
            autoComplete="off"
            value={proteinGPerKg}
            onChange={(event) => {
              setProteinGPerKg(event.target.value);
            }}
          />
          <TextField
            label="Grasa (% de las kcal)"
            inputMode="decimal"
            autoComplete="off"
            value={fatPctKcal}
            onChange={(event) => {
              setFatPctKcal(event.target.value);
            }}
          />
        </div>
      </fieldset>

      <section aria-labelledby="vista-previa-titulo" className="flex flex-col gap-3">
        <h2 id="vista-previa-titulo" className="text-lg font-semibold">
          Vista previa
        </h2>
        {body === null ? (
          <p className="text-sm text-muted-foreground">
            Completa el PAL, el ajuste y los macronutrientes para ver el cálculo.
          </p>
        ) : null}
        {preview.isError && body !== null ? (
          <FormError error={preview.error} title="Así no se puede guardar" />
        ) : null}
        {preview.data && body !== null && !preview.isError ? (
          <div aria-busy={!upToDate}>
            <PrescriptionView prescription={preview.data} />
          </div>
        ) : null}
      </section>

      <FormError error={save.error} title="No se guardó la prescripción" />
      <Notice tone="info" title="Una prescripción no se edita">
        Si algo cambia, se crea otra; las anteriores quedan en el historial.
      </Notice>
      <div>
        <Button
          disabled={!canWrite || !upToDate || save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          {save.isPending ? 'Guardando…' : 'Guardar prescripción'}
        </Button>
      </div>
    </div>
  );
}
