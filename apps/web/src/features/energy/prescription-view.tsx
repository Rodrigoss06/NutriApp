import {
  methodLabel,
  type EngineIssue,
  type EnergyPrescriptionPreview,
} from '@nutricoach/contracts';
import { formatNumber, MethodBadge, Notice } from '@nutricoach/ui';
import type { ReactNode } from 'react';
import { formatDate } from '@/lib/dates';
import { formatInput, GOAL_LABELS, STRATEGY_LABELS } from './labels';

function Warnings({ issues }: { issues: readonly EngineIssue[] }) {
  return issues.map((issue) => (
    <Notice
      key={`${issue.code}-${issue.message}`}
      tone={issue.severity === 'INFO' ? 'info' : 'warning'}
      title={issue.message}
      rule={issue.rule}
    />
  ));
}

function Block({
  title,
  method,
  children,
}: {
  title: string;
  method?: ReactNode;
  children: ReactNode;
}) {
  const id = `energia-${title
    .normalize('NFD')
    .replace(/[^A-Za-z]+/g, '-')
    .toLowerCase()}`;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {method}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

const kcal = (value: number) => `${formatNumber(value, 'kcal')} kcal`;

/**
 * Una prescripción energética, guardada o en vista previa (RF-17, RF-18): cada componente con su método y sus avisos
 * (02 §7, RN-D02). La proyección es una estimación inicial que se recalcula en cada evaluación (RN-E05).
 */
export function PrescriptionView({ prescription }: { prescription: EnergyPrescriptionPreview }) {
  const { rmr, exercise, tee, adjustment, projection, macros } = prescription;
  const method = (code: string) => <MethodBadge label={methodLabel(code)} code={code} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Block title="Datos del cuerpo">
        <dl>
          <Row label="Peso">{formatNumber(prescription.weightKg, 'mass')} kg</Row>
          <Row label="Talla">{formatNumber(prescription.heightCm, 'length')} cm</Row>
          <Row label="Edad al medir">{Math.floor(prescription.ageYears)} años</Row>
          {prescription.fatFreeMassKg === null ? null : (
            <Row label="Masa libre de grasa">
              {formatNumber(prescription.fatFreeMassKg, 'mass')} kg
              {prescription.fatFreeMassMethodCode ? (
                <span className="block">{method(prescription.fatFreeMassMethodCode)}</span>
              ) : null}
            </Row>
          )}
        </dl>
      </Block>

      <Block title="Tasa metabólica en reposo" method={method(rmr.methodCode)}>
        <p className="text-2xl font-semibold tabular-nums">{kcal(rmr.rmrKcal)}</p>
        <Warnings issues={rmr.warnings} />
      </Block>

      <Block title="Gasto energético total" method={method(tee.methodCode)}>
        <dl>
          <Row label="Estrategia">{STRATEGY_LABELS[prescription.strategy]}</Row>
          <Row label={`Base: TMR × PAL ${formatInput(prescription.pal)}`}>{kcal(tee.baseKcal)}</Row>
          {exercise.activities.map((activity) => (
            <Row
              key={activity.activityCode}
              label={`${activity.descriptionEs} · ${formatInput(activity.met)} MET · ${formatInput(activity.minutesPerSession)} min × ${formatInput(activity.sessionsPerWeek)} por semana`}
            >
              {formatNumber(activity.grossKcalPerSession, 'kcal')} kcal brutas y{' '}
              {formatNumber(activity.netKcalPerSession, 'kcal')} netas por sesión
            </Row>
          ))}
          {exercise.activities.length > 0 ? (
            <Row label="Ejercicio neto por día (promedio de la semana)">
              {kcal(exercise.dailyAverageNetKcal)}
              <span className="block">{method(exercise.methodCode)}</span>
            </Row>
          ) : null}
        </dl>
        <p className="text-2xl font-semibold tabular-nums">GET {kcal(tee.teeKcal)}</p>
        <Warnings issues={[...exercise.warnings, ...tee.warnings]} />
      </Block>

      <Block title="Objetivo" method={method(adjustment.methodCode)}>
        <dl>
          <Row label="Objetivo">{GOAL_LABELS[prescription.goal]}</Row>
          <Row label={adjustment.adjustmentKcal < 0 ? 'Déficit' : 'Superávit'}>
            {kcal(Math.abs(adjustment.adjustmentKcal))} por día
          </Row>
          <Row label="Ritmo semanal">
            {formatNumber(Math.abs(adjustment.weeklyRatePct), 'percent')} % del peso por semana
          </Row>
        </dl>
        <p className="text-2xl font-semibold tabular-nums">
          Objetivo {kcal(prescription.targetKcal)}
        </p>
        <Warnings issues={adjustment.warnings} />
      </Block>

      {projection ? (
        <Block title="Peso objetivo y fecha" method={method(projection.methodCode)}>
          <dl>
            <Row label={`Peso con ${formatNumber(projection.targetFatPct, 'percent')} % de grasa`}>
              {formatNumber(projection.targetWeightKg, 'mass')} kg
            </Row>
            <Row label={projection.weightChangeKg < 0 ? 'Por perder' : 'Por ganar'}>
              {formatNumber(Math.abs(projection.weightChangeKg), 'mass')} kg
            </Row>
            {projection.monthsToTarget === null ? null : (
              <Row label="Tiempo estimado">
                {formatNumber(projection.monthsToTarget, 'months')} meses
              </Row>
            )}
            {projection.estimatedDate ? (
              <Row label="Fecha estimada">{formatDate(projection.estimatedDate)}</Row>
            ) : null}
          </dl>
          <p className="text-xs text-muted-foreground">
            Estimación inicial con 7700 kcal por kg: se recalcula con el peso nuevo en cada
            evaluación (RN-E05).
          </p>
          <Warnings issues={projection.warnings} />
        </Block>
      ) : null}

      <Block title="Macronutrientes" method={method(macros.methodCode)}>
        <dl>
          <Row label={`Proteína (${formatInput(macros.proteinGPerKg)} g/kg)`}>
            {formatNumber(macros.proteinG, 'grams')} g
          </Row>
          <Row label={`Grasa (${formatInput(macros.fatPctKcal)} % de las kcal)`}>
            {formatNumber(macros.fatG, 'grams')} g
          </Row>
          <Row label="Carbohidratos (lo que queda)">{formatNumber(macros.choG, 'grams')} g</Row>
        </dl>
        <Warnings issues={macros.warnings} />
      </Block>
    </div>
  );
}
