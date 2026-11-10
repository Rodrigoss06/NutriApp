import { formatNumber, type MeToday } from '@nutricoach/contracts';
import { totalText } from './totals';

const MACROS = [
  { key: 'choG', label: 'Carbohidratos' },
  { key: 'proteinG', label: 'Proteína' },
  { key: 'fatG', label: 'Grasa' },
] as const;

/** Un avance frente a la meta, con el número a la vista: nunca solo la barra (WCAG 1.4.1). */
function Progress({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={value}
      className="h-2 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${String(pct)}%` }} />
    </div>
  );
}

/**
 * Lo que va del día frente a la meta (RF-27, RN-G03): kcal y macronutrientes. Si a un registro le falta un dato, el total dice
 * «al menos» (RN-I03). Sin meta, solo lo registrado.
 */
export function DaySummary({ today }: { today: MeToday }) {
  const { consumed, target } = today;
  return (
    <section aria-labelledby="resumen-dia" className="rounded-xl border border-border bg-card p-4">
      <h2 id="resumen-dia" className="text-lg font-semibold">
        Tu día
      </h2>
      {target?.profile ? (
        <p className="text-sm text-muted-foreground">Meta de hoy: {target.profile.name}.</p>
      ) : null}
      <p className="mt-2 text-3xl font-semibold tabular-nums">
        {totalText(consumed.kcal, 'kcal')}
        <span className="text-base font-normal text-muted-foreground">
          {target ? ` de ${formatNumber(target.kcal, 'kcal')} kcal` : ' kcal'}
        </span>
      </p>
      {target ? (
        <div className="mt-2">
          <Progress label="kcal del día" value={consumed.kcal.known} target={target.kcal} />
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Sin meta para hoy.</p>
      )}
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {MACROS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="flex flex-col gap-1">
              <span className="font-medium tabular-nums">
                {totalText(consumed[key], 'grams')}
                {target ? ` / ${formatNumber(target[key], 'grams')} g` : ' g'}
              </span>
              {target ? (
                <Progress label={label} value={consumed[key].known} target={target[key]} />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
