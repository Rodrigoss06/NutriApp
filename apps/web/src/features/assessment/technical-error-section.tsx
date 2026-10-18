'use client';

import {
  methodLabel,
  type MeasurementSite,
  type RecordTechnicalError,
  type TechnicalErrorsResponse,
} from '@nutricoach/contracts';
import { Button, formatNumber, MethodBadge, Notice, parseDecimal, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatDate, todayIn } from '@/lib/dates';
import { parsePairs } from './capture';
import { FAMILY_LABELS } from './labels';
import { TableScroll } from '@/features/shell/table-scroll';

/** Los 6 pliegues de la suma (G-04): tríceps, subescapular, supraespinal, abdominal, muslo anterior y pantorrilla. */
const SUM_OF_SIX = [
  'SKF_TRICEPS',
  'SKF_SUBSCAPULAR',
  'SKF_SUPRASPINALE',
  'SKF_ABDOMINAL',
  'SKF_FRONT_THIGH',
  'SKF_MEDIAL_CALF',
];

type Source = RecordTechnicalError['source'];

interface StudyRow {
  readonly siteCode: string;
  /** CALCULATED: una línea por par, «12.0 12.4». */
  readonly pairs: string;
  /** DECLARED. */
  readonly temAbs: string;
  readonly temRelPct: string;
}

const emptyRow = (siteCode: string): StudyRow => ({
  siteCode,
  pairs: '',
  temAbs: '',
  temRelPct: '',
});

/**
 * El ETM propio (RF-12, RN-C05): calculado desde un estudio de repetibilidad con pares de 1.ª y 2.ª toma por sitio, o
 * declarado (por ejemplo, el de la acreditación ISAK). Con él se calcula el CMD95 que separa un cambio real del error
 * de medición en la comparación (RN-C06).
 */
export function TechnicalErrorSection({
  memberId,
  initial,
  sites,
}: {
  memberId: string;
  initial: TechnicalErrorsResponse;
  sites: readonly MeasurementSite[];
}) {
  const { timezone } = usePanelSession();
  const canWrite = useCanWrite();
  const [view, setView] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState<Source>('CALCULATED');
  const [validFrom, setValidFrom] = useState(() => todayIn(timezone));
  const [rows, setRows] = useState<StudyRow[]>([]);
  const [pick, setPick] = useState<string | undefined>(undefined);
  const [invalid, setInvalid] = useState<string | null>(null);
  const record = useMutation({
    mutationFn: (body: RecordTechnicalError) =>
      apiFetch<TechnicalErrorsResponse>(`/members/${memberId}/technical-errors`, {
        method: 'POST',
        body,
      }),
    onSuccess: (data) => {
      setView(data);
      setRows([]);
      setAdding(false);
    },
  });
  const site = (code: string) => sites.find((s) => s.code === code);
  const name = (code: string) => site(code)?.nameEs ?? code;
  const available = sites.filter((s) => !rows.some((row) => row.siteCode === s.code));
  const update = (siteCode: string, change: Partial<StudyRow>) => {
    setRows((current) =>
      current.map((row) => (row.siteCode === siteCode ? { ...row, ...change } : row)),
    );
  };

  const submit = () => {
    setInvalid(null);
    if (rows.length === 0) {
      setInvalid('Agrega al menos un sitio.');
      return;
    }
    if (source === 'CALCULATED') {
      const parsed = rows.map((row) => ({ siteCode: row.siteCode, pairs: parsePairs(row.pairs) }));
      const wrong = parsed.find((row) => row.pairs === null);
      if (wrong) {
        setInvalid(
          `${name(wrong.siteCode)}: escribe dos tomas por línea, por ejemplo «12.0 12.4».`,
        );
        return;
      }
      record.mutate({
        source,
        validFrom,
        sites: parsed.map((row) => ({ siteCode: row.siteCode, pairs: row.pairs ?? [] })),
      });
      return;
    }
    const declared = rows.map((row) => ({
      siteCode: row.siteCode,
      temAbs: parseDecimal(row.temAbs),
      temRelPct: parseDecimal(row.temRelPct),
    }));
    const wrong = declared.find((row) => !row.temAbs || !row.temRelPct);
    if (wrong) {
      setInvalid(`${name(wrong.siteCode)}: escribe el ETM y el %ETM, mayores que cero.`);
      return;
    }
    record.mutate({
      source,
      validFrom,
      sites: declared.map((row) => ({
        siteCode: row.siteCode,
        temAbs: row.temAbs ?? 0,
        temRelPct: row.temRelPct ?? 0,
      })),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {view.pooled.length === 0 && view.current.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no registraste tu ETM. Sin él, la comparación entre evaluaciones no puede separar
          un cambio real del error de medición.
        </p>
      ) : null}
      {view.pooled.map((group) => (
        <p key={group.family} className="text-sm">
          {FAMILY_LABELS[group.family]} ({group.siteCodes.length} sitios con estudio): ETM{' '}
          <span className="font-semibold tabular-nums">
            {formatNumber(group.temAbs, 'measurementError')} {group.unit} (
            {formatNumber(group.temRelPct, 'measurementError')} %)
          </span>
          , CMD95{' '}
          <span className="font-semibold tabular-nums">
            {formatNumber(group.mdc95, 'measurementError')} {group.unit}
          </span>{' '}
          <MethodBadge label={methodLabel(group.methodCode)} code={group.methodCode} />
        </p>
      ))}
      {view.current.length > 0 ? (
        <TableScroll label="ETM vigente por sitio">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">ETM vigente por sitio</caption>
            <thead className="bg-surface text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Sitio
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  ETM
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  %ETM
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  CMD95
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Origen
                </th>
              </tr>
            </thead>
            <tbody>
              {view.current.map((row) => {
                const unit = site(row.siteCode)?.unit ?? '';
                return (
                  <tr key={row.id} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {name(row.siteCode)}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.temAbs, 'measurementError')} {unit}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.temRelPct, 'measurementError')} %
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.mdc95, 'measurementError')} {unit}
                    </td>
                    <td className="px-3 py-2">
                      {row.source === 'CALCULATED'
                        ? `Calculado (${String(row.pairs?.length ?? 0)} ${row.pairs?.length === 1 ? 'par' : 'pares'})`
                        : 'Declarado'}{' '}
                      · desde {formatDate(row.validFrom)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      ) : null}

      {canWrite && !adding ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setAdding(true);
            }}
          >
            Registrar ETM
          </Button>
        </div>
      ) : null}
      {canWrite && adding ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4 bg-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Origen del ETM"
              value={source}
              onValueChange={(value) => {
                setSource(value as Source);
              }}
              options={[
                { value: 'CALCULATED', label: 'Calculado con pares de tomas' },
                { value: 'DECLARED', label: 'Declarado (por ejemplo, de la acreditación ISAK)' },
              ]}
            />
            <TextField
              label="Vigente desde"
              type="date"
              value={validFrom}
              onChange={(event) => {
                setValidFrom(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="sm:w-96">
              <Select
                label="Sitio del estudio"
                value={pick}
                onValueChange={setPick}
                options={available.map((s) => ({ value: s.code, label: s.nameEs }))}
              />
            </div>
            <Button
              variant="secondary"
              disabled={!pick}
              onClick={() => {
                if (!pick) return;
                setRows((current) => [...current, emptyRow(pick)]);
                setPick(undefined);
              }}
            >
              Agregar al estudio
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRows((current) => [
                  ...current,
                  ...SUM_OF_SIX.filter((code) => !current.some((row) => row.siteCode === code)).map(
                    emptyRow,
                  ),
                ]);
              }}
            >
              Agregar los 6 pliegues de la suma
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <li key={row.siteCode} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{name(row.siteCode)}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRows((current) => current.filter((r) => r.siteCode !== row.siteCode));
                    }}
                  >
                    Quitar {name(row.siteCode).toLowerCase()}
                  </Button>
                </div>
                {source === 'CALCULATED' ? (
                  <TextAreaField
                    label={`Pares de ${name(row.siteCode).toLowerCase()}`}
                    hint="Una línea por persona medida: 1.ª y 2.ª toma separadas por un espacio, como «12.0 12.4»."
                    className="min-h-20 font-mono tabular-nums"
                    value={row.pairs}
                    onChange={(event) => {
                      update(row.siteCode, { pairs: event.target.value });
                    }}
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      label={`ETM de ${name(row.siteCode).toLowerCase()} (${site(row.siteCode)?.unit ?? ''})`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={row.temAbs}
                      onChange={(event) => {
                        update(row.siteCode, { temAbs: event.target.value });
                      }}
                    />
                    <TextField
                      label={`%ETM de ${name(row.siteCode).toLowerCase()}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={row.temRelPct}
                      onChange={(event) => {
                        update(row.siteCode, { temRelPct: event.target.value });
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {invalid ? <Notice tone="danger" title={invalid} /> : null}
          <FormError error={record.error} title="No se registró el ETM" />
          <div className="flex gap-2">
            <Button disabled={record.isPending} onClick={submit}>
              {record.isPending ? 'Guardando…' : 'Guardar ETM'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setRows([]);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
