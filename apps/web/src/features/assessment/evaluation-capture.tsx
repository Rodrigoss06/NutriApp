'use client';

import type { EvaluationResponse, Measurement, MeasurementSite } from '@nutricoach/contracts';
import {
  Button,
  ConfirmDialog,
  Notice,
  Select,
  StatusBadge,
  cn,
  describedBy,
  FieldMessages,
  formatNumber,
  Input,
  Label,
  parseDecimal,
} from '@nutricoach/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch, type ApiRequest } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/problem';
import { BiaSection } from './bia-section';
import { attemptError, captureGroups, extraSiteOptions, previewAttempts } from './capture';
import { FAMILY_LABELS, SITE_NUMBER_KINDS } from './labels';

const VERSION_CONFLICT = 'NC-ASM-008';

/** Orden de avance con Enter: el protocolo ISAK recorre todos los sitios y repite la serie; también se puede por sitio. */
type CaptureOrder = 'series' | 'site';

type Write = (path: string, request: ApiRequest, ifMatch?: boolean) => Promise<EvaluationResponse>;

/**
 * Captura de una evaluación en borrador (RF-11, RF-13): tomas por sitio con teclado numérico, validación inmediata
 * (RN-C04), aviso de tercera toma en vivo con la vista previa del motor (RN-C02) y consolidado a la vista (RN-C03).
 * Cada sitio se guarda al salir del campo o con Enter; las escrituras van en fila, cada una con la versión de la
 * anterior en If-Match. Cerrar exige todos los sitios del nivel y la bioimpedancia si corresponde (RN-C01, RN-C08).
 */
export function EvaluationCapture({
  initial,
  sites,
}: {
  initial: EvaluationResponse;
  sites: readonly MeasurementSite[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [evaluation, setEvaluation] = useState(initial);
  const [added, setAdded] = useState<string[]>([]);
  const [extra, setExtra] = useState<string | undefined>(undefined);
  const [order, setOrder] = useState<CaptureOrder>('series');
  const [conflict, setConflict] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [closeError, setCloseError] = useState<unknown>(null);
  const [closing, setClosing] = useState(false);
  const version = useRef(initial.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const write: Write = useCallback(
    (path, request, ifMatch = true) => {
      const run = queue.current.then(async () => {
        const response = await apiFetch<EvaluationResponse>(`/evaluations/${initial.id}${path}`, {
          ...request,
          ...(ifMatch ? { headers: { 'If-Match': `"${String(version.current)}"` } } : {}),
        });
        version.current = response.version;
        setEvaluation(response);
        return response;
      });
      queue.current = run.catch((error: unknown) => {
        if (error instanceof ApiError && error.code === VERSION_CONFLICT) setConflict(true);
      });
      return run;
    },
    [initial.id],
  );

  const reload = async () => {
    const latest = await apiFetch<EvaluationResponse>(`/evaluations/${initial.id}`);
    version.current = latest.version;
    setEvaluation(latest);
    setConflict(false);
    setReloads((n) => n + 1);
    if (latest.status !== 'DRAFT') router.refresh();
  };

  const byCode = useMemo(() => new Map(sites.map((site) => [site.code, site])), [sites]);
  const siteName = (code: string) => byCode.get(code)?.nameEs ?? code;
  const measurements = new Map(evaluation.measurements.map((m) => [m.siteCode, m]));
  const required = new Set(evaluation.progress.requiredSites);
  const groups = evaluation.kind === 'BIA' ? [] : captureGroups(sites, evaluation, added);
  const positions = new Map(
    groups.flatMap((g) => g.sites).map((site, index) => [site.code, index]),
  );
  const extras = extraSiteOptions(sites, evaluation, added);
  const { progress } = evaluation;
  const ready = progress.requiredSites.length - progress.missingSites.length;
  const needsBia = evaluation.kind !== 'ANTHROPOMETRY' && evaluation.biaReadings.length === 0;

  /** Enter avanza al campo siguiente: por series (todas las 1.ª, luego las 2.ª) o por sitio. */
  const advance = (from: HTMLInputElement) => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-capture-site]'),
    );
    const key = (input: HTMLInputElement) => {
      const site = Number(input.dataset['captureSite']);
      const attempt = Number(input.dataset['captureAttempt']);
      return order === 'series' ? attempt * 1000 + site : site * 10 + attempt;
    };
    const sorted = inputs.sort((a, b) => key(a) - key(b));
    sorted[sorted.indexOf(from) + 1]?.focus();
  };

  const close = () => {
    setClosing(true);
    setCloseError(null);
    write('/close', { method: 'POST' })
      .then(() => {
        router.refresh();
      })
      .catch((error: unknown) => {
        setCloseError(error);
        setClosing(false);
      });
  };

  return (
    <div className="flex flex-col gap-6">
      {conflict ? (
        <Notice tone="warning" title="Alguien cambió esta evaluación mientras la editabas">
          <span className="flex flex-col gap-2">
            Carga la versión actual: lo guardado por la otra persona aparece en cada sitio.
            <span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void reload();
                }}
              >
                Cargar la versión actual
              </Button>
            </span>
          </span>
        </Notice>
      ) : null}

      {groups.length > 0 ? (
        <section aria-labelledby="captura-titulo" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="captura-titulo" className="text-lg font-semibold">
                Tomas
              </h2>
              <p className="text-sm text-muted-foreground">
                Cada sitio se guarda al salir del campo o con Enter. Diferencia máxima entre la 1.ª
                y la 2.ª toma: 5 % en pliegues y 1 % en el resto; si se supera, se pide una 3.ª
                (RN-C02).
              </p>
            </div>
            <div className="w-full sm:w-72">
              <Select
                label="Con Enter, pasar a"
                value={order}
                onValueChange={(value) => {
                  setOrder(value as CaptureOrder);
                }}
                options={[
                  { value: 'series', label: 'El sitio siguiente (por series)' },
                  { value: 'site', label: 'La toma siguiente del mismo sitio' },
                ]}
              />
            </div>
          </div>
          <p className="text-sm" role="status">
            <span className="font-medium tabular-nums">
              {ready} de {progress.requiredSites.length}
            </span>{' '}
            sitios del nivel listos
            {progress.needsThirdSites.length > 0
              ? ` · falta la 3.ª toma en ${progress.needsThirdSites.map((code) => siteName(code).toLowerCase()).join(', ')}`
              : ''}
          </p>
          {groups.map((group) => (
            <section
              key={group.family}
              aria-labelledby={`familia-${group.family}`}
              className="flex flex-col gap-2"
            >
              <h3 id={`familia-${group.family}`} className="font-semibold">
                {FAMILY_LABELS[group.family]}
              </h3>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
                {group.sites.map((site) => (
                  <SiteRow
                    key={`${site.code}-${String(reloads)}`}
                    site={site}
                    position={positions.get(site.code) ?? 0}
                    measurement={measurements.get(site.code) ?? null}
                    extra={!required.has(site.code)}
                    disabled={!canWrite}
                    onAdvance={advance}
                    onSave={(attempts) =>
                      write(`/measurements/${encodeURIComponent(site.code)}`, {
                        method: 'PUT',
                        body: { attempts },
                      })
                    }
                    onRemove={async (saved) => {
                      if (saved) {
                        await write(`/measurements/${encodeURIComponent(site.code)}`, {
                          method: 'DELETE',
                        });
                      }
                      setAdded((codes) => codes.filter((code) => code !== site.code));
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
          {canWrite && extras.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="sm:w-96">
                <Select
                  label="Sitio extra"
                  hint="Fuera del nivel: por ejemplo, los pliegues propios de Jackson y Pollock."
                  value={extra}
                  onValueChange={setExtra}
                  options={extras.map((site) => ({ value: site.code, label: site.nameEs }))}
                />
              </div>
              <Button
                variant="secondary"
                disabled={!extra}
                onClick={() => {
                  if (!extra) return;
                  setAdded((codes) => [...codes, extra]);
                  setExtra(undefined);
                }}
              >
                Agregar sitio
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {evaluation.kind === 'ANTHROPOMETRY' ? null : (
        <BiaSection evaluation={evaluation} disabled={!canWrite} write={write} />
      )}

      <section aria-labelledby="cierre-titulo" className="flex flex-col gap-3">
        <h2 id="cierre-titulo" className="text-lg font-semibold">
          Cierre
        </h2>
        {progress.canClose ? (
          <p className="text-sm text-muted-foreground">
            Al cerrar, la evaluación ya no se edita: se enmienda con motivo (RN-C07). Los resultados
            se calculan en unos segundos.
          </p>
        ) : (
          <Notice tone="info" title="Todavía no se puede cerrar" rule="RN-C01">
            <ul className="list-disc pl-5">
              {progress.missingSites.length > 0 ? (
                <li>
                  Faltan{' '}
                  {progress.missingSites.map((code) => siteName(code).toLowerCase()).join(', ')}.
                </li>
              ) : null}
              {progress.needsThirdSites.length > 0 ? (
                <li>
                  Falta la 3.ª toma en{' '}
                  {progress.needsThirdSites.map((code) => siteName(code).toLowerCase()).join(', ')}.
                </li>
              ) : null}
              {needsBia ? <li>Falta la lectura de bioimpedancia.</li> : null}
            </ul>
          </Notice>
        )}
        <FormError error={closeError} title="No se cerró la evaluación" />
        <div>
          <ConfirmDialog
            trigger={
              <Button disabled={!canWrite || !progress.canClose || closing}>
                {closing ? 'Cerrando…' : 'Cerrar evaluación'}
              </Button>
            }
            title="Cerrar la evaluación"
            description="Después no se edita: si algo está mal, se enmienda con motivo y lo anterior queda como histórico."
            confirmLabel="Cerrar evaluación"
            onConfirm={close}
          />
        </div>
      </section>
    </div>
  );
}

type RowStatus = 'idle' | 'saving' | 'saved' | 'error';

const sameAttempts = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Un sitio con sus tomas: valida al escribir, avisa la 3.ª toma en vivo y guarda al salir del campo. */
function SiteRow({
  site,
  position,
  measurement,
  extra,
  disabled,
  onSave,
  onRemove,
  onAdvance,
}: {
  site: MeasurementSite;
  position: number;
  measurement: Measurement | null;
  extra: boolean;
  disabled: boolean;
  onSave: (attempts: number[]) => Promise<unknown>;
  onRemove: (saved: boolean) => Promise<void>;
  onAdvance: (from: HTMLInputElement) => void;
}) {
  const [texts, setTexts] = useState<string[]>(() =>
    [0, 1, 2].map((index) => {
      const value = measurement?.attempts[index];
      return value === undefined ? '' : String(value);
    }),
  );
  const [status, setStatus] = useState<RowStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  /** Lo último que se mandó: Enter guarda y el foco que se va dispara otro guardado igual. */
  const sent = useRef<string | null>(JSON.stringify(measurement?.attempts ?? []));

  const values = texts.map((text) => (text.trim() === '' ? null : parseDecimal(text)));
  const fieldErrors = texts.map((text, index) => {
    const value = values[index] ?? null;
    if (text.trim() === '') return null;
    if (value === null) return 'Escribe un número.';
    return attemptError(site, value);
  });
  const [first = null, second = null, third = null] = values;
  const pair = first !== null && second !== null ? [first, second] : null;
  const pairPreview = pair ? previewAttempts(site, pair) : null;
  const needsThird = pairPreview?.needsThird ?? false;
  const typed = [first, second, needsThird ? third : null].filter(
    (value): value is number => value !== null,
  );
  const preview = needsThird && third !== null ? previewAttempts(site, typed) : pairPreview;
  const savedAttempts = measurement?.attempts ?? [];
  const showsSaved = measurement !== null && sameAttempts(savedAttempts, typed);
  const consolidated = showsSaved ? measurement.consolidatedValue : (preview?.consolidated ?? null);
  const diffPct = showsSaved ? measurement.diffPct : (preview?.diffPct ?? null);
  const kind = SITE_NUMBER_KINDS[site.unit];

  const commit = async () => {
    if (disabled || fieldErrors.some(Boolean)) return;
    if (first === null && (second !== null || third !== null)) {
      setError('Escribe primero la 1.ª toma.');
      return;
    }
    const key = JSON.stringify(typed);
    if (sent.current === key) return;
    sent.current = key;
    setError(null);
    setStatus('saving');
    try {
      if (typed.length === 0) await onRemove(true);
      else await onSave(typed);
      setStatus('saved');
    } catch (cause) {
      sent.current = null;
      setStatus('error');
      setError(errorMessage(cause));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const input = event.currentTarget;
    void commit();
    onAdvance(input);
  };

  const attemptsShown = needsThird ? 3 : 2;
  const statusId = `${site.code}-estado`;

  return (
    <li className="flex flex-col gap-3 p-3 lg:flex-row lg:items-start lg:gap-4">
      <div className="flex flex-col gap-0.5 lg:w-64">
        <p className="font-medium">{site.nameEs}</p>
        <p className="text-xs text-muted-foreground">
          {site.unit} · de {String(site.minValue)} a {String(site.maxValue)}
          {extra ? ' · sitio extra' : ''}
        </p>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-2">
        {Array.from({ length: attemptsShown }, (_, index) => (
          <AttemptInput
            key={index}
            siteName={site.nameEs}
            unit={site.unit}
            attempt={index + 1}
            position={position}
            value={texts[index] ?? ''}
            error={fieldErrors[index]}
            describedById={statusId}
            disabled={disabled}
            onChange={(text) => {
              setTexts((current) => current.map((t, i) => (i === index ? text : t)));
              setStatus('idle');
            }}
            onBlur={() => {
              void commit();
            }}
            onKeyDown={onKeyDown}
          />
        ))}
      </div>
      <div id={statusId} className="flex flex-col gap-1 text-sm lg:w-64" aria-live="polite">
        {diffPct !== null ? (
          <p className="text-muted-foreground">
            Diferencia <span className="tabular-nums">{formatNumber(diffPct, 'percent')} %</span>
          </p>
        ) : null}
        {needsThird && third === null ? (
          <StatusBadge tone="warning" className="nc-pulse w-fit">
            Falta la 3.ª toma: supera el {String(site.tolerancePct)} %
          </StatusBadge>
        ) : null}
        {consolidated !== null ? (
          <p>
            Consolidado{' '}
            <span className="font-semibold tabular-nums">
              {formatNumber(consolidated, kind)} {site.unit}
            </span>{' '}
            <span className="text-muted-foreground">
              ({typed.length === 3 ? 'la del medio de 3 tomas' : 'media de 2 tomas'})
            </span>
          </p>
        ) : null}
        {status === 'saving' ? <p className="text-muted-foreground">Guardando…</p> : null}
        {status === 'saved' && showsSaved ? (
          <StatusBadge tone="success">Guardado</StatusBadge>
        ) : null}
        {error ? (
          <p className="text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {extra && !disabled ? (
          <span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void onRemove(measurement !== null).catch((cause: unknown) => {
                  setError(errorMessage(cause));
                });
              }}
            >
              Quitar {site.nameEs.toLowerCase()}
            </Button>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** Una toma: texto con teclado decimal (acepta coma o punto), nombre accesible con el sitio y el número de toma. */
function AttemptInput({
  siteName,
  unit,
  attempt,
  position,
  value,
  error,
  describedById,
  disabled,
  onChange,
  onBlur,
  onKeyDown,
}: {
  siteName: string;
  unit: string;
  attempt: number;
  position: number;
  value: string;
  error: string | null | undefined;
  describedById: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        <span className="sr-only">{siteName}, </span>toma {attempt}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          disabled={disabled}
          value={value}
          data-capture-site={position}
          data-capture-attempt={attempt}
          aria-invalid={error ? true : undefined}
          aria-describedby={[describedById, describedBy(id, undefined, error)]
            .filter(Boolean)
            .join(' ')}
          className={cn('h-11 pr-10 text-right tabular-nums')}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      <FieldMessages id={id} error={error ?? undefined} />
    </div>
  );
}
