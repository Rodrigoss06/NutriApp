import type { Metadata } from 'next';
import { AuthCard } from '@/features/auth/auth-card';
import { RequestResetForm } from '@/features/auth/reset-forms';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function RequestResetPage() {
  return (
    <AuthCard
      title="Recuperar contraseña"
      description="Te enviaremos un enlace para crear una nueva."
    >
      <RequestResetForm />
    </AuthCard>
  );
}
