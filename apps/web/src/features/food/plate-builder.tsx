'use client';

import {
  methodLabel,
  type FoodDetail,
  type FoodListResponse,
  type PlateCompositionRequest,
  type PlateCompositionResponse,
} from '@nutricoach/contracts';
import { Button, EmptyState, MethodBadge, Notice, parseDecimal, Select } from '@nutricoach/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { Section } from '@/features/patients/section';
import { TableScroll } from '@/features/shell/table-scroll';
import { apiFetch } from '@/lib/api/client';
import { useDebounced } from '@/lib/use-debounced';
import { formatMeasureGrams, formatTotal } from './format';
import { FOOD_STATE_LABELS } from './labels';

const GRAMS = 'GRAMS';
const MAX_ITEMS = 50;

interface PlateRow {
  readonly key: string;
  readonly food: Pick<FoodDetail, 'id' | 'name' | 'measures'>;
  /** GRAMS o el id de una medida casera del alimento. */
  readonly unit: string;
  readonly amount: string;
}

type PlateItem = PlateCompositionRequest['items'][number];

/** El ingrediente para la API, o null si la cantidad no es válida. */
function itemOf(row: PlateRow): PlateItem | null {
  const amount = parseDecimal(row.amount);
  if (row.unit === GRAMS) {
    return amount !== null && amount > 0 && amount <= 99_999
      ? { foodId: row.food.id, grams: amount }
      : null;
  }
  return amount !== null && amount > 0 && amount <= 100
    ? { foodId: row.food.id, measureId: row.unit, quantity: amount }
    : null;
}

/**
 * Armar un plato (RF-20 adelantado, ADR-054): alimentos en gramos de parte comestible o en medidas caseras (RN-E12) y
 * lo que aporta el plato, calculado por la API con el motor (RN-E16), con su método (RN-D02). No guarda nada.
 */
export function PlateBuilder() {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<PlateRow[]>([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<unknown>(null);
  const query = useDebounced(search.trim(), 250);
  const found = useQuery({
    queryKey: ['foods', query, 8],
    queryFn: () => apiFetch<FoodListResponse>(`/foods?q=${encodeURIComponent(query)}&limit=8`),
    enabled: query.length >= 2,
  });

  const items = rows.map(itemOf);
  const complete = items.every((item) => item !== null);
  const request: PlateCompositionRequest | null = rows.length > 0 && complete ? { items } : null;
  const debounced = useDebounced(request, 300);
  const plate = useQuery({
    queryKey: ['plate-composition', JSON.stringify(debounced)],
    queryFn: () =>
      apiFetch<PlateCompositionResponse>('/foods/composition', {
        method: 'POST',
        body: debounced,
      }),
    enabled: debounced !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });

  async function add(foodId: string) {
    setAdding(null);
    try {
      const food = await queryClient.query({
        queryKey: ['food', foodId],
        queryFn: () => apiFetch<FoodDetail>(`/foods/${foodId}`),
      });
      setRows((current) => [
        ...current,
        {
          key: crypto.randomUUID(),
          food: { id: food.id, name: food.name, measures: food.measures },
          unit: GRAMS,
          amount: '100',
        },
      ]);
    } catch (error) {
      setAdding(error);
    }
  }

  const update = (key: string, change: Partial<PlateRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };

  const result = rows.length > 0 && plate.data ? plate.data : null;

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Ingredientes"
        description="En gramos de parte comestible o en medidas caseras. No se guarda nada: es para calcular."
      >
        <div className="max-w-md">
          <TextField
            label="Buscar alimento para el plato"
            type="search"
            autoComplete="off"
            hint="Escribe al menos 2 letras, sin importar las tildes."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        <FormError error={found.error ?? adding} title="No pudimos traer el alimento" />
        {found.data && query.length >= 2 ? (
          found.data.foods.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            <ul
              aria-label="Alimentos encontrados"
              className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
            >
              {found.data.foods.map((food) => (
                <li
                  key={food.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-sm">
                    {food.name}{' '}
                    <span className="text-muted-foreground">· {FOOD_STATE_LABELS[food.state]}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={rows.length >= MAX_ITEMS}
                    aria-label={`Agregar ${food.name}`}
                    onClick={() => {
                      void add(food.id);
                    }}
                  >
                    Agregar
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="El plato está vacío"
            description="Busca un alimento y agrégalo para ver lo que aporta."
          />
        ) : (
          <ul aria-label="Ingredientes del plato" className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const valid = items[index] !== null;
              const grams = result && complete ? result.items[index]?.grams : undefined;
              return (
                <li
                  key={row.key}
                  className="grid items-start gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_18rem_8rem_auto]"
                >
                  <div className="flex flex-col gap-1 sm:pt-7">
                    <p className="font-medium">{row.food.name}</p>
                    {grams !== undefined && row.unit !== GRAMS ? (
                      <p className="text-sm text-muted-foreground tabular-nums">
                        Equivale a {formatMeasureGrams(grams)}
                      </p>
                    ) : null}
                  </div>
                  <Select
                    label={
                      <>
                        Medida<span className="sr-only"> de {row.food.name}</span>
                      </>
                    }
                    value={row.unit}
                    onValueChange={(unit) => {
                      update(row.key, { unit, amount: unit === GRAMS ? '100' : '1' });
                    }}
                    options={[
                      { value: GRAMS, label: 'Gramos' },
                      ...row.food.measures.map((measure) => ({
                        value: measure.id,
                        label: `${measure.name} (${formatMeasureGrams(measure.grams)})`,
                      })),
                    ]}
                  />
                  <TextField
                    label={
                      <>
                        {row.unit === GRAMS ? 'Gramos' : 'Cantidad'}
                        <span className="sr-only"> de {row.food.name}</span>
                      </>
                    }
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.amount}
                    error={
                      valid
                        ? undefined
                        : row.unit === GRAMS
                          ? 'Más de 0 g.'
                          : 'Más de 0 y hasta 100.'
                    }
                    onChange={(event) => {
                      update(row.key, { amount: event.target.value });
                    }}
                  />
                  <Button
                    variant="ghost"
                    className="sm:mt-6"
                    aria-label={`Quitar ${row.food.name}`}
                    onClick={() => {
                      setRows((current) => current.filter((r) => r.key !== row.key));
                    }}
                  >
                    <Trash2 aria-hidden />
                    Quitar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {rows.length > 0 ? (
        <Section title="Lo que aporta el plato">
          {plate.isError ? (
            <FormError error={plate.error} title="No pudimos calcular el plato" />
          ) : !result ? (
            <p className="text-muted-foreground">Calculando…</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-lg font-semibold tabular-nums">
                  Peso del plato: {formatMeasureGrams(result.weightG)}
                </p>
                <MethodBadge
                  label={methodLabel(result.methodCode)}
                  code={result.methodCode}
                  version={result.methodVersion}
                />
              </div>
              {result.issues.map((issue) => (
                <Notice
                  key={`${issue.code}-${issue.message}`}
                  tone={issue.severity === 'INFO' ? 'info' : 'warning'}
                  title={issue.message}
                  rule={issue.rule}
                />
              ))}
              <TotalsTable
                caption="Energía y macronutrientes"
                totals={result.totals.filter((t) => t.core)}
              />
              <TotalsTable
                caption="Otros nutrientes"
                totals={result.totals.filter((t) => !t.core)}
              />
              <p className="text-sm text-muted-foreground">
                «Sin dato»: a algún ingrediente le falta ese valor en su fuente, así que el total no
                se puede dar.
              </p>
            </div>
          )}
        </Section>
      ) : null}
    </div>
  );
}

function TotalsTable({
  caption,
  totals,
}: {
  caption: string;
  totals: PlateCompositionResponse['totals'];
}) {
  return (
    <TableScroll label={caption}>
      <table className="w-full border-collapse text-sm">
        <caption className="bg-surface px-3 py-2 text-left font-medium">{caption}</caption>
        <tbody>
          {totals.map((total) => (
            <tr key={total.code} className="border-t border-border">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {total.name}
              </th>
              <td
                className={
                  total.value === null
                    ? 'w-32 px-3 py-2 text-right whitespace-nowrap text-muted-foreground italic'
                    : 'w-32 px-3 py-2 text-right whitespace-nowrap tabular-nums'
                }
              >
                {formatTotal(total.value, total.code, total.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
