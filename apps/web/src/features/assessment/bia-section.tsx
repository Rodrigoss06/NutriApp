'use client';

import {
  BIA_METRIC_UNITS,
  BIA_METRICS,
  type BiaMetric,
  type BiaUnit,
  type CreateBiaReading,
  type EvaluationResponse,
} from '@nutricoach/contracts';
import { Button, Notice, parseDecimal, Select } from '@nutricoach/ui';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import type { ApiRequest } from '@/lib/api/client';
import { BIA_METRIC_LABELS, BIA_UNIT_LABELS, formatReading } from './labels';

interface MetricRow {
  readonly value: string;
  readonly unit: BiaUnit;
  readonly deviceLabel: string;
}

const emptyRows = (): Record<BiaMetric, MetricRow> =>
  Object.fromEntries(
    BIA_METRICS.map((metric) => [
      metric,
      { value: '', unit: BIA_METRIC_UNITS[metric][0], deviceLabel: BIA_METRIC_LABELS[metric] },
    ]),
  ) as Record<BiaMetric, MetricRow>;

/**
 * Bioimpedancia cargada a mano (RF-13, RN-C08, ⚠️ N19): marca, modelo y los indicadores que dio el equipo, cada uno con
 * su unidad y el nombre que le pone el equipo. Es una lectura: se muestra rotulada con el equipo y nunca comparte serie
 * con la antropometría.
 */
export function BiaSection({
  evaluation,
  disabled,
  write,
}: {
  evaluation: EvaluationResponse;
  disabled: boolean;
  write: (path: string, request: ApiRequest, ifMatch?: boolean) => Promise<EvaluationResponse>;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [rows, setRows] = useState(emptyRows);
  const [adding, setAdding] = useState(evaluation.biaReadings.length === 0);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const update = (metric: BiaMetric, change: Partial<MetricRow>) => {
    setRows((current) => ({ ...current, [metric]: { ...current[metric], ...change } }));
  };

  const submit = () => {
    setInvalid(null);
    setError(null);
    const readings: CreateBiaReading['readings'] = [];
    for (const metric of BIA_METRICS) {
      const row = rows[metric];
      if (row.value.trim() === '') continue;
      const value = parseDecimal(row.value);
      if (value === null || value < 0) {
        setInvalid(`${BIA_METRIC_LABELS[metric]}: escribe un número.`);
        return;
      }
      if (row.unit === '%' && value > 100) {
        setInvalid(`${BIA_METRIC_LABELS[metric]}: un porcentaje va de 0 a 100.`);
        return;
      }
      readings.push({
        metric,
        value,
        unit: row.unit,
        deviceLabel: row.deviceLabel.trim() || BIA_METRIC_LABELS[metric],
      });
    }
    if (brand.trim() === '' || model.trim() === '') {
      setInvalid('Escribe la marca y el modelo del equipo.');
      return;
    }
    if (readings.length === 0) {
      setInvalid('Escribe al menos un indicador.');
      return;
    }
    setSaving(true);
    write(
      '/bia-readings',
      { method: 'POST', body: { deviceBrand: brand.trim(), deviceModel: model.trim(), readings } },
      false,
    )
      .then(() => {
        setBrand('');
        setModel('');
        setRows(emptyRows());
        setAdding(false);
      })
      .catch(setError)
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <section aria-labelledby="bia-titulo" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="bia-titulo" className="text-lg font-semibold">
          Bioimpedancia
        </h2>
        <p className="text-sm text-muted-foreground">
          Los valores tal como los muestra el equipo. Se rotulan con su marca y modelo, y no se
          mezclan con los de pliegues (RN-C08).
        </p>
      </div>
      {evaluation.biaReadings.map((reading) => (
        <article
          key={reading.id}
          aria-label={`Lectura de ${reading.deviceBrand} ${reading.deviceModel}`}
          className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card"
        >
          <h3 className="font-medium">
            {reading.deviceBrand} · {reading.deviceModel}
          </h3>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {reading.readings.map((value) => (
              <div key={value.metric} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{value.deviceLabel}</dt>
                <dd className="tabular-nums">{formatReading(value.value, value.unit)}</dd>
              </div>
            ))}
          </dl>
          {disabled ? null : (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  write(`/bia-readings/${reading.id}`, { method: 'DELETE' }, false).catch(setError);
                }}
              >
                Quitar la lectura
              </Button>
            </div>
          )}
        </article>
      ))}
      {disabled ? null : adding ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4 bg-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Marca del equipo"
              autoComplete="off"
              maxLength={60}
              value={brand}
              onChange={(event) => {
                setBrand(event.target.value);
              }}
            />
            <TextField
              label="Modelo"
              autoComplete="off"
              maxLength={60}
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
              }}
            />
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {BIA_METRICS.map((metric) => {
              const row = rows[metric];
              const units = BIA_METRIC_UNITS[metric];
              return (
                <li key={metric} className="grid gap-3 py-3 sm:grid-cols-3 sm:items-end">
                  <TextField
                    label={BIA_METRIC_LABELS[metric]}
                    inputMode="decimal"
                    autoComplete="off"
                    className="text-right tabular-nums"
                    hint={units.length === 1 ? BIA_UNIT_LABELS[row.unit] : undefined}
                    value={row.value}
                    onChange={(event) => {
                      update(metric, { value: event.target.value });
                    }}
                  />
                  {units.length > 1 ? (
                    <Select
                      label={`Unidad de ${BIA_METRIC_LABELS[metric].toLowerCase()}`}
                      value={row.unit}
                      onValueChange={(unit) => {
                        update(metric, { unit: unit as BiaUnit });
                      }}
                      options={units.map((unit) => ({ value: unit, label: BIA_UNIT_LABELS[unit] }))}
                    />
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <TextField
                    label={`Nombre en el equipo: ${BIA_METRIC_LABELS[metric].toLowerCase()}`}
                    autoComplete="off"
                    maxLength={80}
                    value={row.deviceLabel}
                    onChange={(event) => {
                      update(metric, { deviceLabel: event.target.value });
                    }}
                  />
                </li>
              );
            })}
          </ul>
          {invalid ? <Notice tone="danger" title={invalid} /> : null}
          <FormError error={error} title="No se guardó la lectura" />
          <div className="flex gap-2">
            <Button disabled={saving} onClick={submit}>
              {saving ? 'Guardando…' : 'Guardar lectura'}
            </Button>
            {evaluation.biaReadings.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                }}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setAdding(true);
            }}
          >
            Agregar otra lectura
          </Button>
        </div>
      )}
    </section>
  );
}
