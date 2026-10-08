import type { Metadata } from 'next';
import { AuthCard } from '@/features/auth/auth-card';
import { ConfirmResetForm } from '@/features/auth/reset-forms';

export const metadata: Metadata = { title: 'Nueva contraseña', referrer: 'no-referrer' };

export default function ConfirmResetPage() {
  return (
    <AuthCard title="Crea una nueva contraseña">
      <ConfirmResetForm />
    </AuthCard>
  );
}
