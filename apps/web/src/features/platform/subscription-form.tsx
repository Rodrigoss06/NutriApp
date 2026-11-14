'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  changeSubscriptionSchema,
  type ChangeSubscription,
  type PlanListResponse,
} from '@nutricoach/contracts';
import { Button, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { changeSubscription } from './platform-api';

/**
 * Renovar o cambiar de plan (RN-A02): crea otra suscripción con los límites del plan elegido, congelados; la anterior queda
 * reemplazada y la organización vuelve a estar activa.
 */
export function SubscriptionForm({
  organizationId,
  plans,
  currentPlan,
  today,
}: {
  organizationId: string;
  plans: PlanListResponse['plans'];
  currentPlan: string | null;
  today: string;
}) {
  const router = useRouter();
  const form = useForm<ChangeSubscription>({
    resolver: zodResolver(changeSubscriptionSchema),
    defaultValues: { planCode: currentPlan ?? plans[0]?.code ?? '', startsOn: today, reason: '' },
  });
  const save = useMutation({
    mutationFn: (values: ChangeSubscription) =>
      changeSubscription(organizationId, {
        ...values,
        reason: values.reason ? values.reason : null,
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      aria-label="Renovar o cambiar de plan"
      className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(values);
        }),
      )}
    >
      <Controller
        control={form.control}
        name="planCode"
        render={({ field }) => (
          <Select
            label="Plan"
            value={field.value}
            onValueChange={field.onChange}
            options={plans.map((plan) => ({
              value: plan.code,
              label: `${plan.name} (${plan.code})`,
            }))}
            error={errors.planCode?.message}
          />
        )}
      />
      <TextField
        label="Desde"
        type="date"
        error={errors.startsOn?.message}
        {...form.register('startsOn')}
      />
      <TextField
        label="Motivo (opcional)"
        autoComplete="off"
        error={errors.reason?.message}
        {...form.register('reason')}
      />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormError error={save.error} title="No se cambió la suscripción" />
        {save.isSuccess ? <Notice tone="success" title="Suscripción actualizada" /> : null}
        <Button type="submit" className="w-fit" disabled={save.isPending}>
          {currentPlan ? 'Renovar o cambiar de plan' : 'Asignar plan'}
        </Button>
      </div>
    </form>
  );
}
