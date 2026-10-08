'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type AccountResponse, type LoginRequest } from '@nutricoach/contracts';
import { Button } from '@nutricoach/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { PasswordField, TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { apiFetch } from '@/lib/api/client';

/** Destino tras entrar: la sesión PLATFORM va al panel interno; STAFF, a donde iba. */
export function destinationFor(account: AccountResponse, next: string): string {
  return account.kind === 'PLATFORM' ? '/admin/plataforma' : next;
}

/** Entrar (RF-01): una sola falla para todo (RN-A07); con 429, cuántos minutos esperar. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });
  const login = useMutation({
    mutationFn: (input: LoginRequest) =>
      apiFetch<AccountResponse>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (account) => {
      queryClient.clear();
      router.replace(destinationFor(account, next));
      router.refresh();
    },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={submitWith(
        form.handleSubmit((values) => {
          login.mutate(values);
        }),
      )}
    >
      <FormError error={login.error} title="No pudiste entrar" />
      <TextField
        label="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...form.register('email')}
      />
      <PasswordField
        label="Contraseña"
        autoComplete="current-password"
        error={errors.password?.message}
        {...form.register('password')}
      />
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Entrando…' : 'Entrar'}
      </Button>
      <Link href="/recuperar" className="text-sm text-brand-text underline">
        Olvidé mi contraseña
      </Link>
    </form>
  );
}
