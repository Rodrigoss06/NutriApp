'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSupportGrantSchema,
  SUPPORT_GRANT_MAX_DAYS,
  SUPPORT_SCOPE_LABELS,
  type CreateSupportGrant,
  type SupportGrant,
  type SupportStaffResponse,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';

type Staff = SupportStaffResponse['staff'][number];
interface FormValues {
  supportUserId: string;
  scope: CreateSupportGrant['scope'];
  reason: string;
  durationDays: number;
}

const STATUS_LABELS = {
  ACTIVE: 'Vigente',
  EXPIRED: 'Venció',
  REVOKED: 'Revocado',
} as const satisfies Record<SupportGrant['status'], string>;

const DAYS = Array.from({ length: SUPPORT_GRANT_MAX_DAYS }, (_, index) => index + 1);

/**
 * El soporte de la plataforma con tu permiso (RN-A09, ADR-130): a quién de la lista del soporte, qué puede ver, por qué y por cuántos
 * días; los permisos vigentes y los de los últimos 90 días, y revocar. Solo el dueño. El soporte solo lee, y todo lo que mira queda
 * en la auditoría.
 */
export function SupportGrantsSection({
  staff,
  grants,
}: {
  staff: readonly Staff[];
  grants: readonly SupportGrant[];
}) {
  const router = useRouter();
  const { timezone } = usePanelSession();
  const canWrite = useCanWrite();
  const defaults: FormValues = {
    supportUserId: staff[0]?.userId ?? '',
    scope: 'ACCOUNT',
    reason: '',
    durationDays: 1,
  };
  const form = useForm<FormValues>({
    resolver: zodResolver(createSupportGrantSchema) as unknown as Resolver<FormValues>,
    defaultValues: defaults,
  });
  const grant = useMutation({
    mutationFn: (input: FormValues) =>
      apiFetch<SupportGrant>('/organization/support-grants', { method: 'POST', body: input }),
    onSuccess: () => {
      form.reset(defaults);
      router.refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      apiFetch<undefined>(`/organization/support-grants/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Si el soporte necesita revisar algo, dale un permiso por unos días. Solo puede mirar, nunca
        cambiar nada, y todo lo que mira queda en la auditoría.
      </p>
      {staff.length === 0 ? (
        <Notice tone="info" title="La plataforma no tiene personas de soporte">
          Cuando haya alguien, podrás darle un permiso desde aquí.
        </Notice>
      ) : (
        <form
          noValidate
          aria-label="Dar un permiso de soporte"
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={submitWith(
            form.handleSubmit((values) => {
              grant.mutate(values);
            }),
          )}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Controller
              control={form.control}
              name="supportUserId"
              render={({ field }) => (
                <Select
                  label="Persona de soporte"
                  value={field.value}
                  disabled={!canWrite}
                  onValueChange={field.onChange}
                  options={staff.map((s) => ({ value: s.userId, label: s.displayName }))}
                />
              )}
            />
            <Controller
              control={form.control}
              name="scope"
              render={({ field }) => (
                <Select
                  label="Qué puede ver"
                  value={field.value}
                  disabled={!canWrite}
                  onValueChange={field.onChange}
                  options={(['ACCOUNT', 'CLINICAL_READ'] as const).map((scope) => ({
                    value: scope,
                    label: SUPPORT_SCOPE_LABELS[scope],
                  }))}
                />
              )}
            />
            <Controller
              control={form.control}
              name="durationDays"
              render={({ field }) => (
                <Select
                  label="Por cuánto tiempo"
                  value={String(field.value)}
                  disabled={!canWrite}
                  onValueChange={(value) => {
                    field.onChange(Number(value));
                  }}
                  options={DAYS.map((days) => ({
                    value: String(days),
                    label: days === 1 ? '24 horas' : `${String(days)} días`,
                  }))}
                />
              )}
            />
          </div>
          <TextField
            label="Motivo"
            autoComplete="off"
            maxLength={300}
            disabled={!canWrite}
            error={form.formState.errors.reason?.message}
            {...form.register('reason')}
          />
          <div>
            <Button type="submit" disabled={!canWrite || grant.isPending}>
              Dar el permiso
            </Button>
          </div>
          <FormError error={grant.error} title="No se dio el permiso" />
        </form>
      )}
      <FormError error={revoke.error} title="No se revocó el permiso" />
      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nunca le diste un permiso al soporte.</p>
      ) : (
        <ul
          aria-label="Permisos de soporte"
          className="divide-y divide-border rounded-lg border border-border bg-card"
        >
          {grants.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">
                  {item.supportName ?? 'Ya no es del soporte'} · {SUPPORT_SCOPE_LABELS[item.scope]}
                </span>
                <span className="text-sm text-muted-foreground">
                  {STATUS_LABELS[item.status]} ·{' '}
                  {item.status === 'REVOKED' && item.revokedAt
                    ? `revocado el ${formatInstant(item.revokedAt, timezone)}`
                    : `${item.status === 'ACTIVE' ? 'vence' : 'venció'} el ${formatInstant(item.expiresAt, timezone)}`}
                </span>
                <span className="text-sm break-words">{item.reason}</span>
              </div>
              {item.status === 'ACTIVE' ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="secondary" size="sm" disabled={!canWrite || revoke.isPending}>
                      Revocar
                    </Button>
                  }
                  title="¿Revocar el permiso?"
                  description={`${item.supportName ?? 'Esa persona'} deja de ver tu organización en su próxima acción.`}
                  confirmLabel="Revocar"
                  tone="danger"
                  onConfirm={() => {
                    revoke.mutate(item.id);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
