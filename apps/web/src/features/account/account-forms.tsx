'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  changePasswordSchema,
  updateAccountSchema,
  type ChangePassword,
  type MemberProfileResponse,
  type SessionListResponse,
  type UpdateAccount,
  type UpdateMemberProfile,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { NEW_PASSWORD_HINT, PasswordField, TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { PROFESSION_LABELS } from '@/features/organization/labels';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatInstant } from '@/lib/dates';
import { deviceLabel } from './device';

export function NameForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const form = useForm<UpdateAccount>({
    resolver: zodResolver(updateAccountSchema),
    values: { displayName },
  });
  const save = useMutation({
    mutationFn: (input: UpdateAccount) => apiFetch('/account', { method: 'PATCH', body: input }),
    onSuccess: () => {
      router.refresh();
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(values);
        }),
      )}
    >
      <div className="flex-1">
        <TextField
          label="Nombre"
          autoComplete="name"
          error={form.formState.errors.displayName?.message}
          {...form.register('displayName')}
        />
      </div>
      <Button type="submit" disabled={save.isPending}>
        Guardar nombre
      </Button>
      <FormError error={save.error} />
    </form>
  );
}

/** Cambiar la contraseña pide la actual; cierra las demás sesiones y deja abierta esta (RN-A08). */
export function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const form = useForm<ChangePassword>({ resolver: zodResolver(changePasswordSchema) });
  const change = useMutation({
    mutationFn: (input: ChangePassword) =>
      apiFetch('/account/password', { method: 'POST', body: input }),
    onSuccess: () => {
      form.reset({ currentPassword: '', newPassword: '' });
      router.refresh();
    },
  });
  const { errors } = form.formState;
  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          change.mutate(values);
        }),
      )}
    >
      {/* El gestor de contraseñas asocia la nueva con esta cuenta. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <FormError error={change.error} />
      {change.isSuccess ? (
        <Notice tone="success" title="Contraseña actualizada">
          Cerramos tus sesiones en otros equipos.
        </Notice>
      ) : null}
      <PasswordField
        label="Contraseña actual"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...form.register('currentPassword')}
      />
      <PasswordField
        label="Nueva contraseña"
        autoComplete="new-password"
        hint={NEW_PASSWORD_HINT}
        error={errors.newPassword?.message}
        {...form.register('newPassword')}
      />
      <div>
        <Button type="submit" disabled={change.isPending}>
          Cambiar contraseña
        </Button>
      </div>
    </form>
  );
}

type Session = SessionListResponse['sessions'][number];

/** Sesiones activas con su equipo y última actividad; cerrar una o todas (esta incluida). */
export function SessionsSection({ sessions }: { sessions: readonly Session[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { timezone } = usePanelSession();
  const toLogin = () => {
    queryClient.clear();
    router.replace('/entrar');
    router.refresh();
  };
  const closeOne = useMutation({
    mutationFn: (session: Session) =>
      apiFetch(`/account/sessions/${session.id}`, { method: 'DELETE' }).then(() => session),
    onSuccess: (session) => {
      if (session.current) toLogin();
      else router.refresh();
    },
  });
  const closeAll = useMutation({
    mutationFn: () => apiFetch('/account/sessions/revoke-all', { method: 'POST' }),
    onSuccess: toLogin,
  });
  return (
    <div className="flex flex-col gap-3">
      <FormError error={closeOne.error ?? closeAll.error} />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col">
              <span className="font-medium">
                {deviceLabel(session.userAgent)}{' '}
                {session.current ? <StatusBadge tone="info">Este equipo</StatusBadge> : null}
              </span>
              <span className="text-sm text-muted-foreground">
                Última actividad: {formatInstant(session.lastSeenAt, timezone)}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={closeOne.isPending}
              onClick={() => {
                closeOne.mutate(session);
              }}
            >
              Cerrar sesión
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <ConfirmDialog
          trigger={<Button variant="danger">Cerrar todas las sesiones</Button>}
          title="¿Cerrar todas las sesiones?"
          description="Se cierran en todos tus equipos, incluido este. Tendrás que volver a entrar."
          confirmLabel="Cerrar todas"
          tone="danger"
          onConfirm={() => {
            closeAll.mutate();
          }}
        />
      </div>
    </div>
  );
}

interface ProfileValues {
  profession: '' | NonNullable<UpdateMemberProfile['profession']>;
  licenseNumber: string;
  title: string;
}

/** Perfil profesional en la organización activa: profesión, colegiatura y título. */
export function ProfessionalProfileForm({ profile }: { profile: MemberProfileResponse }) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const form = useForm<ProfileValues>({
    values: {
      profession: profile.profession ?? '',
      licenseNumber: profile.licenseNumber ?? '',
      title: profile.title ?? '',
    },
  });
  const save = useMutation({
    mutationFn: (values: ProfileValues) =>
      apiFetch('/organization/profile', {
        method: 'PUT',
        body: {
          profession: values.profession === '' ? null : values.profession,
          licenseNumber: values.licenseNumber,
          title: values.title,
        } satisfies UpdateMemberProfile,
      }),
    onSuccess: () => {
      router.refresh();
    },
  });
  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          save.mutate(values);
        }),
      )}
    >
      <FormError error={save.error} />
      {save.isSuccess ? <Notice tone="success" title="Perfil guardado" /> : null}
      <Controller
        control={form.control}
        name="profession"
        render={({ field }) => (
          <Select
            label="Profesión"
            placeholder="Elige tu profesión"
            value={field.value || undefined}
            disabled={!canWrite}
            onValueChange={field.onChange}
            options={Object.entries(PROFESSION_LABELS).map(([value, label]) => ({ value, label }))}
          />
        )}
      />
      <TextField
        label="Colegiatura"
        hint="Número de colegiatura, si tienes."
        autoComplete="off"
        maxLength={40}
        disabled={!canWrite}
        {...form.register('licenseNumber')}
      />
      <TextField
        label="Título"
        hint="Por ejemplo: Lic. en Nutrición."
        maxLength={120}
        disabled={!canWrite}
        {...form.register('title')}
      />
      <div>
        <Button type="submit" disabled={!canWrite || save.isPending}>
          Guardar perfil
        </Button>
      </div>
    </form>
  );
}
