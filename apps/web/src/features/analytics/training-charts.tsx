'use client';

import type { OneRmSeries, TrainingWeek } from '@nutricoach/contracts';
import { methodLabel } from '@nutricoach/contracts';
import { formatNumber, MethodBadge, Select } from '@nutricoach/ui';
import { ColumnChart, TrendChart } from '@nutricoach/ui/chart';
import { useState } from 'react';
import { shortDate } from './diet-view';
import { oneRmKey } from './training-view';

const count = (value: number | null) => formatNumber(value, 'grams');
const load = (value: number | null) => formatNumber(value, 'trainingLoad');
const label = (week: TrainingWeek) => `S${String(week.weekNo)}`;

/**
 * RF-33 por semana del macrociclo: sesiones registradas contra programadas, tonelaje y carga sRPE, cada una en su gráfico
 * (sin segundo eje). Las semanas que no empezaron quedan vacías.
 */
export function TrainingWeekCharts({ weeks }: { weeks: readonly TrainingWeek[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ColumnChart
        title="Sesiones por semana"
        description="Registradas por el paciente contra las programadas."
        unit="sesiones"
        categoryName="Semana"
        valueName="Registradas"
        referenceName="Programadas"
        format={count}
        points={weeks.map((week) => ({
          label: label(week),
          value: week.sessionsDone,
          reference: week.sessionsPlanned,
        }))}
      />
      <ColumnChart
        title="Tonelaje por semana"
        description="Peso × repeticiones de las series efectivas."
        unit="kg"
        categoryName="Semana"
        valueName="Tonelaje"
        format={load}
        points={weeks.map((week) => ({ label: label(week), value: week.tonnageKg }))}
      />
      <ColumnChart
        title="Carga sRPE por semana"
        description="Duración × RPE de cada sesión del registro diario."
        unit="min × RPE"
        categoryName="Semana"
        valueName="Carga sRPE"
        format={load}
        points={weeks.map((week) => ({ label: label(week), value: week.srpeLoad }))}
      />
    </div>
  );
}

/** RN-F04: el 1RM estimado de un ejercicio en el tiempo, con la fórmula del programa; una fórmula por serie (RN-D03). */
export function OneRmChart({ series }: { series: readonly OneRmSeries[] }) {
  const [selected, setSelected] = useState(series[0] ? oneRmKey(series[0]) : '');
  const current = series.find((item) => oneRmKey(item) === selected) ?? series[0];
  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay series efectivas de 1 a 12 repeticiones con peso para estimar el 1RM.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 ? (
        <Select
          label="Ejercicio"
          className="max-w-sm"
          value={oneRmKey(current)}
          onValueChange={setSelected}
          options={series.map((item) => ({
            value: oneRmKey(item),
            label: `${item.exerciseName} · ${methodLabel(item.formula)}`,
          }))}
        />
      ) : null}
      <TrendChart
        title={`1RM estimado de ${current.exerciseName}`}
        description={
          current.method ? (
            <MethodBadge
              label={methodLabel(current.method.code)}
              code={current.method.code}
              version={current.method.version}
            />
          ) : (
            methodLabel(current.formula)
          )
        }
        unit="kg"
        categoryName="Día"
        seriesName="1RM estimado"
        format={(value) => formatNumber(value, 'mass')}
        points={current.points.map((point) => ({
          label: shortDate(point.localDate),
          value: point.estimated1rmKg,
        }))}
      />
    </div>
  );
}
