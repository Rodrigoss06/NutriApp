'use client';

import type { FoodListResponse, FoodLogsResponse, LogFood } from '@nutricoach/contracts';
import { formatNumber, MEAL_SLOTS } from '@nutricoach/contracts';
import { Button, Notice, NumberField, Select } from '@nutricoach/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';
import { newClientId, useRecord } from './records';

const SLOT_LABELS: Record<(typeof MEAL_SLOTS)[number], string> = {
  BREAKFAST: 'Desayuno',
  MID_MORNING: 'Media mañana',
  LUNCH: 'Almuerzo',
  AFTERNOON: 'Media tarde',
  DINNER: 'Cena',
  CUSTOM: 'Otro momento',
};

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

/**
 * Algo que no está en el plan (RN-G05): se busca en el catálogo que ve la organización y queda marcado fuera del plan, con los
 * nutrientes del alimento por sus gramos.
 */
export function OffPlanLogger({ localDate, editable }: { localDate: string; editable: boolean }) {
  const [text, setText] = useState('');
  const term = useDebounced(text.trim(), 250);
  const [food, setFood] = useState<{ id: string; name: string } | null>(null);
  const [grams, setGrams] = useState<number | null>(100);
  const [slot, setSlot] = useState<(typeof MEAL_SLOTS)[number]>('AFTERNOON');
  const results = useQuery({
    queryKey: ['me-foods', term],
    queryFn: () => apiFetch<FoodListResponse>(`/me/foods?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  });
  const record = useRecord<LogFood, FoodLogsResponse>('/me/food-logs');

  return (
    <div className="flex flex-col gap-3">
      {record.isSuccess ? (
        <Notice tone="success" title="Registrado fuera del plan">
          {record.data.records[0]?.itemName}.
        </Notice>
      ) : null}
      <TextField
        label="Buscar un alimento"
        type="search"
        value={text}
        disabled={!editable}
        onChange={(event) => {
          setText(event.target.value);
          setFood(null);
        }}
      />
      {results.data && !food ? (
        <ul aria-label="Alimentos encontrados" className="flex flex-col gap-1">
          {results.data.foods.map((item) => (
            <li key={item.id}>
              <Button
                variant="ghost"
                size="touch"
                className="w-full justify-between text-left whitespace-normal"
                onClick={() => {
                  setFood({ id: item.id, name: item.name });
                }}
              >
                <span>{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  {item.energyKcalPer100g === null
                    ? 'sin dato'
                    : `${formatNumber(item.energyKcalPer100g, 'kcal')} kcal / 100 g`}
                </span>
              </Button>
            </li>
          ))}
          {results.data.foods.length === 0 ? (
            <li className="text-sm text-muted-foreground">No encontramos ese alimento.</li>
          ) : null}
        </ul>
      ) : null}
      {food ? (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-border bg-muted p-3">
          <p className="font-medium">{food.name}</p>
          <NumberField label="Cantidad" unit="g" value={grams} onValueChange={setGrams} />
          <Select
            label="¿En qué momento?"
            value={slot}
            onValueChange={(value) => {
              setSlot(value as (typeof MEAL_SLOTS)[number]);
            }}
            options={MEAL_SLOTS.map((value) => ({ value, label: SLOT_LABELS[value] }))}
          />
          <FormError error={record.error} title="No se registró" />
          <Button
            size="touch"
            disabled={record.isPending || grams === null || grams <= 0}
            onClick={() => {
              if (grams === null) return;
              record.mutate(
                {
                  clientId: newClientId(),
                  localDate,
                  source: { kind: 'CATALOG', mealSlotCode: slot, foodId: food.id, grams },
                },
                {
                  onSuccess: () => {
                    setFood(null);
                    setText('');
                  },
                },
              );
            }}
          >
            Registrar fuera del plan
          </Button>
        </div>
      ) : null}
    </div>
  );
}
