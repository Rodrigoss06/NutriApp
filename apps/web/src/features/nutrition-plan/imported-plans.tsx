import type { ImportedPlan } from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import { importedPeriod, importedTargets } from './imported-plan-view';

function Targets({ plan }: { plan: ImportedPlan }) {
  const targets = importedTargets(plan);
  if (targets.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {targets.map((target) => (
        <div key={target.label} className="flex flex-col">
          <dt className="text-muted-foreground">{target.label}</dt>
          <dd className="font-medium tabular-nums">{target.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Los planes del sistema anterior, de la migración de cuentas (RF-40, ADR-135): historial de solo lectura con sus metas y sus
 * indicaciones, tal como venían. No son planes de NutriCoach: no tienen tiempos de comida ni prescripción.
 */
export function ImportedPlansSection({ plans }: { plans: readonly ImportedPlan[] }) {
  if (plans.length === 0) return null;
  return (
    <section aria-labelledby="planes-importados" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id="planes-importados" className="text-base font-semibold">
          Planes del sistema anterior
        </h3>
        <p className="text-sm text-muted-foreground">
          Entraron con la migración de la cuenta. Son de solo lectura: el plan vigente se arma en
          NutriCoach.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {plans.map((plan) => (
          <li key={plan.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{importedPeriod(plan)}</span>
              <StatusBadge tone="info">Importado</StatusBadge>
            </div>
            <Targets plan={plan} />
            {plan.instructions ? (
              <p className="whitespace-pre-line text-sm">
                <span className="text-muted-foreground">Indicaciones: </span>
                {plan.instructions}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Las metas del último plan del sistema anterior, al lado del plan nuevo (ADR-135): solo de referencia. Las del plan nuevo salen de
 * su prescripción energética (RF-18, RN-D01).
 */
export function ImportedPlanReference({ plan }: { plan: ImportedPlan | undefined }) {
  if (!plan) return null;
  return (
    <Notice tone="info" title="Último plan del sistema anterior, de referencia">
      <div className="flex flex-col gap-2">
        <p>
          {importedPeriod(plan)}. Las metas del plan nuevo salen de su prescripción energética:
          estas no se copian.
        </p>
        <Targets plan={plan} />
      </div>
    </Notice>
  );
}
