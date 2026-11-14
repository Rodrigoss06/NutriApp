'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createOrganizationSchema,
  type CreateOrganization,
  type PlanListResponse,
} from '@nutricoach/contracts';
import { Button, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { createOrganization } from './platform-api';

/** El alta de una organización con su primer plan; el dueño recibe la invitación por correo (ADR-034). */
export function CreateOrganizationForm({
  plans,
  today,
}: {
  plans: PlanListResponse['plans'];
  today: string;
}) {
  const router = useRouter();
  const form = useForm<z.input<typeof createOrganizationSchema>, unknown, CreateOrganization>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      timezone: 'America/Lima',
      planCode: plans[0]?.code ?? '',
      startsOn: today,
      ownerEmail: '',
    },
  });
  const create = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      form.reset();
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  return (
    <section aria-labelledby="nueva-organizacion" className="flex flex-col gap-3">
      <h2 id="nueva-organizacion" className="text-lg font-semibold">
        Nueva organización
      </h2>
      <form
        noValidate
        aria-label="Nueva organización"
        className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2"
        onSubmit={submitWith(
          form.handleSubmit((values) => {
            create.mutate(values);
          }),
        )}
      >
        <TextField
          label="Nombre"
          autoComplete="off"
          error={errors.name?.message}
          {...form.register('name')}
        />
        <TextField
          label="Identificador"
          hint="Minúsculas, dígitos y guiones."
          autoComplete="off"
          error={errors.slug?.message}
          {...form.register('slug')}
        />
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
          label="Correo del dueño"
          type="email"
          autoComplete="off"
          error={errors.ownerEmail?.message}
          {...form.register('ownerEmail')}
        />
        <TextField
          label="Zona horaria"
          autoComplete="off"
          error={errors.timezone?.message}
          {...form.register('timezone')}
        />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <FormError error={create.error} title="No se creó la organización" />
          {create.isSuccess ? (
            <Notice tone="success" title="Organización creada">
              El dueño recibe la invitación por correo.
            </Notice>
          ) : null}
          <Button type="submit" className="w-fit" disabled={create.isPending}>
            Crear organización
          </Button>
        </div>
      </form>
    </section>
  );
}
