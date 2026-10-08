'use client';

import type { AccountResponse, InspectInvitationResponse } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { NEW_PASSWORD_HINT, PasswordField, TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useFragmentToken } from '@/features/forms/fragment-token';
import { apiFetch } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/problem';
import { ROLE_LABELS } from '@/features/organization/labels';

interface AcceptValues {
  readonly displayName: string;
  readonly password: string;
}

/**
 * Aceptar una invitación (RF-01). El token sale del fragmento y viaja en el cuerpo. Con una cuenta existente se
 * acepta con su contraseña actual; si no, nombre y contraseña nueva.
 */
export function AcceptInvitation() {
  const token = useFragmentToken();
  const router = useRouter();
  const queryClient = useQueryClient();
  const inspect = useQuery({
    queryKey: ['invitation', token],
    enabled: typeof token === 'string',
    retry: false,
    gcTime: 0,
    queryFn: () =>
      apiFetch<InspectInvitationResponse>('/invitations/inspect', {
        method: 'POST',
        body: { token },
      }),
  });
  const form = useForm<AcceptValues>({ defaultValues: { displayName: '', password: '' } });
  const accept = useMutation({
    mutationFn: (values: AcceptValues) =>
      apiFetch<AccountResponse>('/invitations/accept', {
        method: 'POST',
        body: {
          token,
          password: values.password,
          ...(inspect.data?.accountExists ? {} : { displayName: values.displayName }),
        },
      }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/panel');
      router.refresh();
    },
  });

  if (token === undefined || (token && inspect.isPending)) {
    return <p className="text-muted-foreground">Cargando la invitación…</p>;
  }
  if (token === null || inspect.isError) {
    return (
      <Notice tone="danger" title="No podemos usar esta invitación">
        {token === null ? 'Abre el enlace tal como llegó al correo.' : errorMessage(inspect.error)}{' '}
        <Link href="/entrar">Ir a entrar</Link>
      </Notice>
    );
  }
  const invitation = inspect.data;
  if (!invitation) return null;
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          accept.mutate(values);
        }),
      )}
    >
      <Notice tone="info" title={`Te invitaron a ${invitation.organizationName}`}>
        Como {ROLE_LABELS[invitation.role].toLowerCase()}.
        {invitation.accountExists
          ? ' Ya tienes una cuenta con este correo: confirma con tu contraseña actual.'
          : ' Crea tu cuenta para aceptar.'}
      </Notice>
      <FormError error={accept.error} title="No se pudo aceptar" />
      <TextField
        label="Correo"
        type="email"
        autoComplete="username"
        value={invitation.email}
        readOnly
      />
      {invitation.accountExists ? (
        <PasswordField
          label="Contraseña actual"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password', { required: 'Escribe tu contraseña.' })}
        />
      ) : (
        <>
          <TextField
            label="Tu nombre"
            autoComplete="name"
            error={errors.displayName?.message}
            {...form.register('displayName', { required: 'Escribe tu nombre.', maxLength: 120 })}
          />
          <PasswordField
            label="Contraseña"
            autoComplete="new-password"
            hint={NEW_PASSWORD_HINT}
            error={errors.password?.message}
            {...form.register('password', { required: 'Escribe una contraseña.' })}
          />
        </>
      )}
      <Button type="submit" disabled={accept.isPending}>
        Aceptar invitación
      </Button>
    </form>
  );
}
