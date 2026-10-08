import type { Metadata } from 'next';
import { AuthCard } from '@/features/auth/auth-card';
import { LoginForm } from '@/features/auth/login-form';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Entrar" description="Usa el correo con el que te invitaron.">
      <LoginForm next={safeNext(typeof next === 'string' ? next : null)} />
    </AuthCard>
  );
}
