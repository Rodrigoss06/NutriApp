'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordResetRequestSchema, type PasswordResetRequest } from '@nutricoach/contracts';
import { Button, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { NEW_PASSWORD_HINT, PasswordField, TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useFragmentToken } from '@/features/forms/fragment-token';
import { apiFetch } from '@/lib/api/client';

/** Siempre el mismo mensaje, exista o no la cuenta (RN-A07). */
export const RESET_SENT =
  'Si el correo está registrado, te enviamos un enlace que vence en 1 hora.';

export function RequestResetForm() {
  const form = useForm<PasswordResetRequest>({ resolver: zodResolver(passwordResetRequestSchema) });
  const request = useMutation({
    mutationFn: (input: PasswordResetRequest) =>
      apiFetch('/auth/password-reset', { method: 'POST', body: input }),
  });
  if (request.isSuccess) {
    return (
      <Notice tone="success" title="Revisa tu correo">
        {RESET_SENT}
      </Notice>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          request.mutate(values);
        }),
      )}
    >
      <FormError error={request.error} />
      <TextField
        label="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={form.formState.errors.email?.message}
        {...form.register('email')}
      />
      <Button type="submit" disabled={request.isPending}>
        Enviar enlace
      </Button>
      <Link href="/entrar" className="text-sm text-brand-text underline">
        Volver a entrar
      </Link>
    </form>
  );
}

const newPasswordSchema = z.object({
  newPassword: z.string().min(1, 'Escribe tu nueva contraseña.'),
});

/** Fijar la contraseña con el enlace: no inicia sesión y cierra todas las sesiones (RN-A08). */
export function ConfirmResetForm() {
  const token = useFragmentToken();
  const form = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
  });
  const confirm = useMutation({
    mutationFn: ({ newPassword }: { newPassword: string }) =>
      apiFetch('/auth/password-reset/confirm', {
        method: 'POST',
        body: { token, newPassword },
      }),
  });
  if (token === undefined) return <p className="text-muted-foreground">Cargando…</p>;
  if (token === null) {
    return (
      <Notice tone="danger" title="El enlace no es válido">
        Ábrelo tal como llegó al correo o <Link href="/recuperar">pide uno nuevo</Link>.
      </Notice>
    );
  }
  if (confirm.isSuccess) {
    return (
      <Notice tone="success" title="Contraseña actualizada">
        Cerramos tus sesiones abiertas. <Link href="/entrar">Entra con tu nueva contraseña</Link>.
      </Notice>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          confirm.mutate(values);
        }),
      )}
    >
      <FormError error={confirm.error} />
      <PasswordField
        label="Nueva contraseña"
        autoComplete="new-password"
        hint={NEW_PASSWORD_HINT}
        error={form.formState.errors.newPassword?.message}
        {...form.register('newPassword')}
      />
      <Button type="submit" disabled={confirm.isPending}>
        Guardar contraseña
      </Button>
    </form>
  );
}
