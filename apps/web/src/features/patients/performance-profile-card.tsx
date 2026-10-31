import {
  methodLabel,
  PERFORMANCE_CLASS_LABELS,
  PROFILE_DOMAIN_CODES,
  PROFILE_DOMAIN_LABELS,
  type PerformanceProfileResponse,
} from '@nutricoach/contracts';
import { formatNumber, IndicatorCard, MethodBadge } from '@nutricoach/ui';
import { Fragment } from 'react';

const CLASS_KEYS = Object.keys(
  PERFORMANCE_CLASS_LABELS,
) as (keyof typeof PERFORMANCE_CLASS_LABELS)[];

/** El nombre de una clase y su valor; sin dato, lo dice (un dato que falta no es cero). */
const classRow = (
  key: (typeof CLASS_KEYS)[number],
  classes: PerformanceProfileResponse['classes'],
) => {
  const { label, values } = PERFORMANCE_CLASS_LABELS[key];
  const value = classes[key];
  return {
    label,
    value: value === null ? 'Sin datos' : (values as Readonly<Record<string, string>>)[value],
  };
};

/**
 * El perfil de rendimiento de una anamnesis (RN-F16, 07 §12): el PRI, sus siete dominios de 0 a 100 y sus clases, con su
 * método (RN-D02). Orienta al coach, no prescribe solo. El número es el que guardó la API, que no se recalcula.
 */
export function PerformanceProfileCard({ profile }: { profile: PerformanceProfileResponse }) {
  const method = (
    <MethodBadge
      label={methodLabel(profile.methodCode)}
      code={profile.methodCode}
      version={profile.methodVersion}
    />
  );
  return (
    <section aria-labelledby="perfil-rendimiento" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id="perfil-rendimiento" className="font-semibold">
          Perfil de rendimiento
        </h3>
        <p className="text-sm text-muted-foreground">
          Orienta al coach: no prescribe solo. Cuentan solo las preguntas respondidas.
        </p>
      </div>
      {profile.pri === null ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <p className="text-sm">Todavía no hay respuestas que den puntaje.</p>
          {method}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <IndicatorCard
            label="PRI"
            value={formatNumber(profile.pri, 'index')}
            unit="de 100"
            method={method}
          />
          <section
            aria-label="Puntaje por dominio"
            className="rounded-lg border border-border bg-card p-4 shadow-card"
          >
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-2 text-sm">
              {PROFILE_DOMAIN_CODES.map((domain) => {
                const score = profile.domainScores[domain];
                return (
                  <Fragment key={domain}>
                    <dt className="flex flex-col gap-1">
                      {PROFILE_DOMAIN_LABELS[domain]}
                      <span aria-hidden className="block h-1 rounded-full bg-border">
                        <span
                          className="block h-1 rounded-full bg-brand"
                          style={{ width: `${String(score ?? 0)}%` }}
                        />
                      </span>
                    </dt>
                    <dd className="text-right font-medium tabular-nums">
                      {score === null ? 'Sin datos' : formatNumber(score, 'index')}
                    </dd>
                  </Fragment>
                );
              })}
            </dl>
            <div className="mt-3">{method}</div>
          </section>
          <section
            aria-label="Clases del perfil"
            className="rounded-lg border border-border bg-card p-4 shadow-card"
          >
            <dl className="flex flex-col gap-2 text-sm">
              {CLASS_KEYS.map((key) => {
                const { label, value } = classRow(key, profile.classes);
                return (
                  <div key={key} className="flex flex-col">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}
