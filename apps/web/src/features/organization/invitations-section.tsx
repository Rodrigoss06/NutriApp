'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  inviteStaffSchema,
  type InvitationListResponse,
  type InviteStaff,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCan, useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { ROLE_LABELS } from './labels';

type Invitation = InvitationListResponse['invitations'][number];

/** Invitaciones de staff (RF-01, RN-A03): invitar, reenviar y revocar. Solo OWNER y ADMIN. */
export function InvitationsSection({ invitations }: { invitations: readonly Invitation[] }) {
  const router = useRouter();
  const { timezone } = usePanelSession();
  const { grantOwner } = useCan();
  const canWrite = useCanWrite();
  const form = useForm<InviteStaff>({
    resolver: zodResolver(inviteStaffSchema),
    defaultValues: { email: '', role: 'PROFESSIONAL' },
  });
  const refresh = () => {
    router.refresh();
  };
  const invite = useMutation({
    mutationFn: (input: InviteStaff) =>
      apiFetch<{ id: string }>('/organization/invitations', { method: 'POST', body: input }),
    onSuccess: () => {
      form.reset({ email: '', role: 'PROFESSIONAL' });
      refresh();
    },
  });
  const resend = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/organization/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/organization/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const roles = (Object.keys(ROLE_LABELS) as InviteStaff['role'][]).filter(
    (r) => grantOwner || r !== 'OWNER',
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={submitWith(
          form.handleSubmit((values) => {
            invite.mutate(values);
          }),
        )}
      >
        <div className="flex-1">
          <TextField
            label="Correo de la persona"
            type="email"
            autoComplete="off"
            inputMode="email"
            disabled={!canWrite}
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
        </div>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select
              label="Rol"
              value={field.value}
              disabled={!canWrite}
              onValueChange={field.onChange}
              options={roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
              className="sm:w-44"
            />
          )}
        />
        <Button type="submit" disabled={!canWrite || invite.isPending}>
          Invitar
        </Button>
      </form>
      <FormError error={invite.error ?? resend.error ?? revoke.error} />
      {invite.isSuccess ? (
        <Notice tone="success" title="Invitación enviada">
          Le llegará un correo con el enlace para unirse.
        </Notice>
      ) : null}
      {invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {invitations.map((invitation) => {
            const expired = new Date(invitation.expiresAt) <= new Date();
            return (
              <li
                key={invitation.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{invitation.email}</span>
                  <span className="text-sm text-muted-foreground">
                    {ROLE_LABELS[invitation.role as InviteStaff['role']]} ·{' '}
                    {expired ? 'Venció' : 'Vence'} el{' '}
                    {formatInstant(invitation.expiresAt, timezone)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canWrite || resend.isPending}
                    onClick={() => {
                      resend.mutate(invitation.id);
                    }}
                  >
                    Reenviar
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" disabled={!canWrite}>
                        Revocar
                      </Button>
                    }
                    title="¿Revocar la invitación?"
                    description={`El enlace enviado a ${invitation.email} deja de funcionar.`}
                    confirmLabel="Revocar"
                    tone="danger"
                    onConfirm={() => {
                      revoke.mutate(invitation.id);
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
