'use client';

import {
  FOOD_STATES,
  type FoodDetail,
  type FoodState,
  type NutrientCatalogResponse,
  type OwnFoodRequest,
} from '@nutricoach/contracts';
import { Button, parseDecimal, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { FOOD_STATE_OPTIONS } from './labels';

type CatalogNutrient = NutrientCatalogResponse['nutrients'][number];

interface OwnFoodValues {
  readonly name: string;
  readonly state: FoodState | '';
  readonly ediblePortionPct: string;
  /** Lo que se escribió para cada código INFOODS; vacío es «sin dato». */
  readonly nutrients: Record<string, string>;
  readonly measures: { readonly name: string; readonly grams: string }[];
}

const MAX_MEASURES = 30;

const asText = (value: number | null): string => (value === null ? '' : String(value));

function initialValues(nutrients: readonly CatalogNutrient[], food?: FoodDetail): OwnFoodValues {
  const values = new Map(food?.nutrients.map((n) => [n.code, n.valuePer100g]));
  return {
    name: food?.name ?? '',
    state: food?.state ?? '',
    ediblePortionPct: food ? String(food.ediblePortionPct) : '100',
    nutrients: Object.fromEntries(
      nutrients.map((n) => [n.code, asText(values.get(n.code) ?? null)]),
    ),
    measures: food?.measures.map((m) => ({ name: m.name, grams: String(m.grams) })) ?? [],
  };
}

/** El pedido para la API: lo vacío no viaja y queda «sin dato» (RN-I03); las medidas sin nada escrito se omiten. */
function requestOf(values: OwnFoodValues): OwnFoodRequest {
  return {
    name: values.name.trim(),
    state: values.state as FoodState,
    ediblePortionPct: parseDecimal(values.ediblePortionPct) ?? 100,
    nutrients: Object.fromEntries(
      Object.entries(values.nutrients)
        .filter(([, text]) => text.trim() !== '')
        .map(([code, text]) => [code, parseDecimal(text)]),
    ),
    measures: values.measures
      .filter((m) => m.name.trim() !== '' || m.grams.trim() !== '')
      .map((m) => ({ name: m.name.trim(), grams: parseDecimal(m.grams) ?? 0 })),
  };
}

const positiveOrEmpty = (text: string): true | string => {
  if (text.trim() === '') return true;
  const value = parseDecimal(text);
  return value !== null && value >= 0 ? true : 'Escribe un número de 0 en adelante.';
};

/**
 * Alimento propio de la organización (RN-I01): nombre, estado, parte comestible, nutrientes por 100 g de parte
 * comestible y medidas caseras. Lo que no se sabe queda vacío: es «sin dato», no cero (RN-I03). Editar envía la versión
 * leída en If-Match y reemplaza las medidas.
 */
export function OwnFoodForm({
  nutrients,
  food,
}: {
  nutrients: readonly CatalogNutrient[];
  /** Al editar: el alimento como se leyó. */
  food?: FoodDetail;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const form = useForm<OwnFoodValues>({ defaultValues: initialValues(nutrients, food) });
  const measures = useFieldArray({ control: form.control, name: 'measures' });
  const save = useMutation({
    mutationFn: (body: OwnFoodRequest) =>
      food
        ? apiFetch<FoodDetail>(`/foods/${food.id}`, {
            method: 'PUT',
            body,
            headers: { 'If-Match': `"${String(food.version)}"` },
          })
        : apiFetch<FoodDetail>('/foods', { method: 'POST', body }),
    onSuccess: ({ id }) => {
      router.push(`/panel/biblioteca/alimentos/${id}`);
      router.refresh();
    },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex max-w-4xl flex-col gap-6"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(requestOf(values));
        }),
      )}
    >
      <FormError
        error={save.error}
        title={food ? 'No se pudo guardar el alimento' : 'No se pudo crear el alimento'}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nombre"
          autoComplete="off"
          error={errors.name?.message}
          {...form.register('name', {
            validate: (text) =>
              text.trim().length >= 2 ? true : 'Escribe el nombre: 2 letras o más.',
          })}
        />
        <Controller
          control={form.control}
          name="state"
          rules={{ required: 'Elige el estado en que valen los nutrientes.' }}
          render={({ field }) => (
            <Select
              label="Estado"
              value={field.value || undefined}
              onValueChange={field.onChange}
              hint="En el que valen los nutrientes y los gramos (RN-E12)."
              error={errors.state?.message}
              options={FOOD_STATES.map((value) => ({ value, label: FOOD_STATE_OPTIONS[value] }))}
            />
          )}
        />
        <TextField
          label="Parte comestible (%)"
          inputMode="decimal"
          autoComplete="off"
          hint="Lo que se come de lo que se compra: sin cáscara, hueso ni semillas."
          error={errors.ediblePortionPct?.message}
          {...form.register('ediblePortionPct', {
            validate: (text) => {
              const value = parseDecimal(text);
              return value !== null && value > 0 && value <= 100
                ? true
                : 'Escribe un porcentaje mayor que 0 y hasta 100.';
            },
          })}
        />
      </div>

      <NutrientFields
        legend="Energía y macronutrientes por 100 g"
        nutrients={nutrients.filter((n) => n.core)}
        form={form}
      />
      <NutrientFields
        legend="Otros nutrientes por 100 g"
        nutrients={nutrients.filter((n) => !n.core)}
        form={form}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">Medidas caseras</legend>
        <p className="text-sm text-muted-foreground">
          Su peso en gramos de parte comestible, como «Unidad: 40 g» o «Taza: 150 g».
        </p>
        {measures.fields.map((field, index) => (
          <div key={field.id} className="grid items-start gap-3 sm:grid-cols-[1fr_12rem_auto]">
            <TextField
              label={`Medida ${String(index + 1)}`}
              autoComplete="off"
              error={errors.measures?.[index]?.name?.message}
              {...form.register(`measures.${index}.name`, {
                validate: (text, values) =>
                  text.trim() !== '' || values.measures[index]?.grams.trim() === ''
                    ? true
                    : 'Escribe el nombre de la medida.',
              })}
            />
            <TextField
              label={`Gramos de la medida ${String(index + 1)}`}
              inputMode="decimal"
              autoComplete="off"
              error={errors.measures?.[index]?.grams?.message}
              {...form.register(`measures.${index}.grams`, {
                validate: (text, values) => {
                  if (text.trim() === '' && values.measures[index]?.name.trim() === '') return true;
                  const value = parseDecimal(text);
                  return value !== null && value > 0 ? true : 'Escribe los gramos: más de 0.';
                },
              })}
            />
            <Button
              variant="ghost"
              className="sm:mt-6"
              aria-label={`Quitar la medida ${String(index + 1)}`}
              onClick={() => {
                measures.remove(index);
              }}
            >
              <Trash2 aria-hidden />
              Quitar
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="secondary"
            disabled={measures.fields.length >= MAX_MEASURES}
            onClick={() => {
              measures.append({ name: '', grams: '' });
            }}
          >
            <Plus aria-hidden />
            Agregar medida
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canWrite || save.isPending}>
          {food ? 'Guardar cambios' : 'Crear alimento'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            router.back();
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function NutrientFields({
  legend,
  nutrients,
  form,
}: {
  legend: string;
  nutrients: readonly CatalogNutrient[];
  form: UseFormReturn<OwnFoodValues>;
}) {
  const { errors } = form.formState;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-lg font-semibold">{legend}</legend>
      <p className="text-sm text-muted-foreground">
        De parte comestible. Deja vacío lo que no sabes: queda «sin dato», que no es cero.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nutrients.map((nutrient) => (
          <TextField
            key={nutrient.code}
            label={`${nutrient.name} (${nutrient.unit})`}
            inputMode="decimal"
            autoComplete="off"
            error={errors.nutrients?.[nutrient.code]?.message}
            {...form.register(`nutrients.${nutrient.code}`, { validate: positiveOrEmpty })}
          />
        ))}
      </div>
    </fieldset>
  );
}
