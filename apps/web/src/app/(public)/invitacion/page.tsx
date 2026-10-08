import type { Metadata } from 'next';
import { AcceptInvitation } from '@/features/auth/accept-invitation';
import { AuthCard } from '@/features/auth/auth-card';

export const metadata: Metadata = { title: 'Aceptar invitación', referrer: 'no-referrer' };

export default function InvitationPage() {
  return (
    <AuthCard title="Aceptar invitación">
      <AcceptInvitation />
    </AuthCard>
  );
}
