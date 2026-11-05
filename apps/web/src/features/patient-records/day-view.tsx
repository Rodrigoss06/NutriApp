import {
  formatNumber,
  INDICATION_TEXTS,
  METHOD_LABELS,
  type CareTeamMember,
  type DayTotal,
  type MealSlot,
  type MemberResponse,
  type PatientDay,
  type RecordAdjustment,
} from '@nutricoach/contracts';
import { MethodBadge, StatusBadge } from '@nutricoach/ui';
import type { ReactNode } from 'react';
import { MEAL_SLOT_LABELS } from '@/features/nutrition-plan/labels';
import { TableScroll } from '@/features/shell/table-scroll';
import { AdjustRecord } from './adjust-record';
import {
  foodFields,
  hydrationFields,
  latestByTarget,
  metricFields,
  setFields,
  workoutFields,
  type CorrectableField,
} from './adjustments';

const slotLabel = (code: string): string =>
  (MEAL_SLOT_LABELS as Readonly<Record<string, string>>)[code as MealSlot] ?? code;

/** «al menos» cuando a un registro le falta el dato (RN-I03). */
function totalText(total: DayTotal, kind: 'kcal' | 'grams'): string {
  if (total.value !== null) return formatNumber(total.value, kind);
  return total.known > 0 || total.missing > 0
    ? `al menos ${formatNumber(total.known, kind)}`
    : formatNumber(0, kind);
}

const VALUE_NAMES: Readonly<
  Record<string, { label: string; unit: string; kind: 'grams' | 'mass' | 'index' }>
> = {
  grams: { label: 'cantidad', unit: 'g', kind: 'grams' },
  servings: { label: 'porciones', unit: '', kind: 'index' },
  volumeMl: { label: 'agua', unit: 'ml', kind: 'grams' },
  value: { label: 'peso', unit: 'kg', kind: 'mass' },
  reps: { label: 'repeticiones', unit: '', kind: 'grams' },
  loadKg: { label: 'peso', unit: 'kg', kind: 'mass' },
  durationMinutes: { label: 'duración', unit: 'min', kind: 'grams' },
  sessionRpe: { label: 'RPE', unit: '', kind: 'index' },
};

/** Lo corregido como se dice: «agua 500 ml». Lo derivado (nutrientes, tonelaje) no se repite aquí. */
function correctionText(adjustment: RecordAdjustment): string {
  return Object.entries(adjustment.correctedValues ?? {})
    .filter(([key]) => key in VALUE_NAMES)
    .flatMap(([key, value]) => {
      const name = VALUE_NAMES[key];
      return name && value !== null
        ? [`${name.label} ${formatNumber(value, name.kind)}${name.unit ? ` ${name.unit}` : ''}`]
        : [];
    })
    .join(', ');
}

/** El ajuste de un registro, con su autor y su motivo (RN-G02). */
function AdjustmentNote({
  adjustment,
  members,
}: {
  adjustment: RecordAdjustment | undefined;
  members: readonly MemberResponse[];
}) {
  if (!adjustment) return null;
  const author =
    members.find((member) => member.id === adjustment.authorMemberId)?.displayName ?? 'El equipo';
  return (
    <span className="flex flex-col gap-1 text-xs">
      <span className="flex flex-wrap items-center gap-1">
        {adjustment.action === 'EXCLUDE' ? (
          <StatusBadge tone="warning">Excluido</StatusBadge>
        ) : (
          <StatusBadge tone="info">Corregido: {correctionText(adjustment)}</StatusBadge>
        )}
      </span>
      <span className="text-muted-foreground">
        {author}: {adjustment.reason}
      </span>
    </span>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold">
      {children}
    </h2>
  );
}

/**
 * Un día del paciente para su equipo (RN-G01): lo que registró, en solo lectura, con los ajustes del profesional (RN-G02). Los
 * totales del día van con los ajustes aplicados, que son los que usará la analítica, y lo registrado aparte.
 */
export function DayView({
  day,
  patientId,
  careTeam,
  members,
}: {
  day: PatientDay;
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
}) {
  const latest = latestByTarget(day.adjustments);
  const adjustable = (
    targetType: Parameters<typeof AdjustRecord>[0]['targetType'],
    targetId: string,
    description: string,
    fields: readonly CorrectableField[],
  ) => (
    <AdjustRecord
      patientId={patientId}
      careTeam={careTeam}
      members={members}
      targetType={targetType}
      targetId={targetId}
      localDate={day.localDate}
      description={description}
      fields={fields}
    />
  );
  const adjusted = day.adjustments.length > 0;
  const empty =
    day.foods.length === 0 &&
    day.hydration.length === 0 &&
    day.metrics.length === 0 &&
    day.workouts.length === 0 &&
    day.checkin === null &&
    day.notes.length === 0;

  if (empty) {
    return <p className="text-muted-foreground">Ese día no tiene registros.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="resumen-dia" className="flex flex-col gap-2">
        <SectionTitle id="resumen-dia">Resumen del día</SectionTitle>
        <TableScroll label="Totales del día">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Total
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {adjusted ? 'Con ajustes' : 'Registrado'}
                </th>
                {adjusted ? (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Registrado
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(
                [
                  ['Energía (kcal)', day.totals.kcal, day.originalTotals.kcal, 'kcal'],
                  ['Carbohidratos (g)', day.totals.choG, day.originalTotals.choG, 'grams'],
                  ['Proteína (g)', day.totals.proteinG, day.originalTotals.proteinG, 'grams'],
                  ['Grasa (g)', day.totals.fatG, day.originalTotals.fatG, 'grams'],
                ] as const
              ).map(([label, total, original, kind]) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {label}
                  </th>
                  <td className="px-3 py-2 text-right">{totalText(total, kind)}</td>
                  {adjusted ? (
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {totalText(original, kind)}
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  Agua (ml)
                </th>
                <td className="px-3 py-2 text-right">{formatNumber(day.waterMl, 'grams')}</td>
                {adjusted ? (
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatNumber(day.originalWaterMl, 'grams')}
                  </td>
                ) : null}
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </section>

      {day.foods.length > 0 ? (
        <section aria-labelledby="comidas-dia" className="flex flex-col gap-2">
          <SectionTitle id="comidas-dia">Comidas</SectionTitle>
          <TableScroll label="Comidas del día">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Tiempo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Alimento
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Cantidad
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    kcal
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Ajuste
                  </th>
                </tr>
              </thead>
              <tbody>
                {day.foods.map((food) => {
                  const amount =
                    food.servings !== null && food.servings > 0
                      ? `${formatNumber(food.servings, 'index')} porc.`
                      : `${formatNumber(food.grams, 'grams')} g`;
                  return (
                    <tr key={food.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">{slotLabel(food.mealSlotCode)}</td>
                      <td className="px-3 py-2">
                        {food.itemName}
                        {food.inPlan ? null : (
                          <span className="block text-xs text-muted-foreground">
                            Fuera del plan
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{amount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(food.kcal, 'kcal')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <AdjustmentNote adjustment={latest.get(food.id)} members={members} />
                          {adjustable(
                            'FOOD',
                            food.id,
                            `${food.itemName}, ${amount}`,
                            foodFields(food),
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ) : null}

      {day.hydration.length > 0 || day.metrics.length > 0 ? (
        <section aria-labelledby="agua-peso" className="flex flex-col gap-2">
          <SectionTitle id="agua-peso">Agua y peso</SectionTitle>
          <ul className="flex flex-col gap-2">
            {day.hydration.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-card p-3"
              >
                <span className="tabular-nums">Agua, {formatNumber(log.volumeMl, 'grams')} ml</span>
                <span className="flex flex-col items-end gap-1">
                  <AdjustmentNote adjustment={latest.get(log.id)} members={members} />
                  {adjustable(
                    'HYDRATION',
                    log.id,
                    `Agua, ${formatNumber(log.volumeMl, 'grams')} ml`,
                    hydrationFields(log.volumeMl),
                  )}
                </span>
              </li>
            ))}
            {day.metrics.map((metric) => (
              <li
                key={metric.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-card p-3"
              >
                <span className="tabular-nums">
                  Peso en casa, {formatNumber(metric.value, 'mass')} kg
                </span>
                <span className="flex flex-col items-end gap-1">
                  <AdjustmentNote adjustment={latest.get(metric.id)} members={members} />
                  {adjustable(
                    'METRIC',
                    metric.id,
                    `Peso, ${formatNumber(metric.value, 'mass')} kg`,
                    metricFields(metric.value),
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {day.workouts.length > 0 ? (
        <section aria-labelledby="entrenos-dia" className="flex flex-col gap-3">
          <SectionTitle id="entrenos-dia">Entrenamiento</SectionTitle>
          {day.workouts.map((workout, index) => (
            <article
              key={workout.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm tabular-nums">
                  Sesión {workout.outcome === 'SKIPPED' ? 'no hecha' : 'registrada'} ·{' '}
                  {formatNumber(workout.tonnageKg, 'trainingLoad')} kg de tonelaje
                  {workout.durationMinutes !== null
                    ? ` · ${String(workout.durationMinutes)} min`
                    : ''}
                  {workout.sessionRpe !== null
                    ? ` · RPE ${formatNumber(workout.sessionRpe, 'index')}`
                    : ''}
                </p>
                <span className="flex flex-col items-end gap-1">
                  <AdjustmentNote adjustment={latest.get(workout.id)} members={members} />
                  {adjustable('WORKOUT', workout.id, 'la sesión', workoutFields(workout))}
                </span>
              </div>
              {workout.sets.length > 0 ? (
                <TableScroll label={`Series de la sesión ${String(index + 1)}`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th scope="col" className="px-3 py-2 font-medium">
                          Ejercicio
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Serie
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Rep × kg
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Tonelaje (kg)
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Ajuste
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {workout.sets.map((set) => (
                        <tr key={set.id} className="border-t border-border align-top">
                          <td className="px-3 py-2">
                            {set.exerciseName}
                            {set.isWarmup ? (
                              <span className="block text-xs text-muted-foreground">
                                Calentamiento
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right">{set.setNo}</td>
                          <td className="px-3 py-2 text-right">
                            {set.reps ?? '—'} × {formatNumber(set.loadKg, 'mass')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatNumber(set.tonnageKg, 'trainingLoad')}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <AdjustmentNote adjustment={latest.get(set.id)} members={members} />
                              {adjustable(
                                'SET',
                                set.id,
                                `${set.exerciseName}, serie ${String(set.setNo)}`,
                                setFields(set),
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {day.checkin ? (
        <section aria-labelledby="registro-diario-dia" className="flex flex-col gap-2">
          <SectionTitle id="registro-diario-dia">Registro diario</SectionTitle>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p>
                <span className="font-medium">
                  {INDICATION_TEXTS[day.checkin.readiness?.indication ?? 'NO_DATA'].label}
                </span>
                {day.checkin.readiness?.readinessScore != null ? (
                  <span className="tabular-nums">
                    {' '}
                    · recuperación {formatNumber(day.checkin.readiness.readinessScore, 'index')} de
                    100
                  </span>
                ) : null}
              </p>
              <span className="flex flex-col items-end gap-1">
                <AdjustmentNote adjustment={latest.get(day.checkin.id)} members={members} />
                {adjustable('CHECKIN', day.checkin.id, 'el registro diario', [])}
              </span>
            </div>
            {day.checkin.readiness ? (
              <MethodBadge
                label={METHOD_LABELS.READINESS_JV}
                code={day.checkin.readiness.methodCode}
                version={day.checkin.readiness.methodVersion}
              />
            ) : null}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums sm:grid-cols-4">
              {(
                [
                  ['Sueño', day.checkin.sleepHours, 'h'],
                  ['Fatiga', day.checkin.fatigue, '/5'],
                  ['Dolor muscular', day.checkin.soreness, '/5'],
                  ['Estrés', day.checkin.stress, '/5'],
                  ['Motivación', day.checkin.motivation, '/5'],
                  ['Síntomas del ciclo', day.checkin.menstrualSymptoms, '/3'],
                  ['Sesión', day.checkin.sessionMinutes, 'min'],
                  ['RPE de la sesión', day.checkin.sessionRpe, ''],
                ] as const
              )
                .filter(([, value]) => value !== null)
                .map(([label, value, unit]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>
                      {formatNumber(value, 'index')} {unit}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        </section>
      ) : null}

      {day.notes.length > 0 ? (
        <section aria-labelledby="notas-dia" className="flex flex-col gap-2">
          <SectionTitle id="notas-dia">Notas del día</SectionTitle>
          <ul className="flex flex-col gap-2">
            {day.notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p>{note.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.readAt ? 'Leída' : 'Sin leer'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
